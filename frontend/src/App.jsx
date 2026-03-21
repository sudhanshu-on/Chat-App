import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { apiRequest } from "./lib/api.js";
import "./App.css";

const LOCAL_USER_STORAGE_KEY = "chat-app:user";
const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL;

const sortConversationsByRecent = (left, right) => {
  const leftDate = new Date(left.updatedAt || 0).getTime();
  const rightDate = new Date(right.updatedAt || 0).getTime();
  return rightDate - leftDate;
};

const upsertConversation = (list, conversation) => {
  if (!conversation?._id) {
    return list;
  }

  const existingIndex = list.findIndex((item) => item._id === conversation._id);
  const nextList = [...list];

  if (existingIndex === -1) {
    nextList.push(conversation);
  } else {
    nextList[existingIndex] = { ...nextList[existingIndex], ...conversation };
  }

  return nextList.sort(sortConversationsByRecent);
};

const readStoredUser = () => {
  try {
    const value = localStorage.getItem(LOCAL_USER_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const formatMessageTime = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const emptyAuthForm = {
  name: "",
  username: "",
  email: "",
  password: "",
};

function App() {
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [currentUser, setCurrentUser] = useState(readStoredUser);
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messagesByConversation, setMessagesByConversation] = useState({});
  const [loadedThreads, setLoadedThreads] = useState({});
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [messageDraft, setMessageDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(false);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [socketStatus, setSocketStatus] = useState("offline");

  const socketRef = useRef(null);
  const selectedConversationRef = useRef(selectedConversationId);
  const messageTailRef = useRef(null);

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(LOCAL_USER_STORAGE_KEY);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    let isCancelled = false;

    const loadInitialData = async () => {
      setIsAppLoading(true);
      setNotice("");

      try {
        const [usersResult, conversationsResult] = await Promise.all([
          apiRequest("/auth/users"),
          apiRequest("/conversations/me"),
        ]);

        if (isCancelled) {
          return;
        }

        const nextUsers = Array.isArray(usersResult.data) ? usersResult.data : [];
        const nextConversations = Array.isArray(conversationsResult.data)
          ? [...conversationsResult.data].sort(sortConversationsByRecent)
          : [];

        setUsers(nextUsers);
        setConversations(nextConversations);

        setSelectedConversationId((previousValue) => {
          if (previousValue && nextConversations.some((item) => item._id === previousValue)) {
            return previousValue;
          }

          return nextConversations[0]?._id || null;
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error.status === 401) {
          setCurrentUser(null);
          setNotice("Session expired. Sign in again to continue.");
          return;
        }

        setNotice(error.message || "Could not load users and conversations.");
      } finally {
        if (!isCancelled) {
          setIsAppLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id]);

  const selectedConversationIsLoaded =
    selectedConversationId && loadedThreads[selectedConversationId];

  useEffect(() => {
    if (!currentUser?.id || !selectedConversationId) {
      return undefined;
    }

    setUnreadByConversation((previousValue) => ({
      ...previousValue,
      [selectedConversationId]: 0,
    }));

    if (selectedConversationIsLoaded) {
      return undefined;
    }

    let isCancelled = false;

    const loadMessages = async () => {
      setIsThreadLoading(true);

      try {
        const result = await apiRequest(`/messages/${selectedConversationId}`);
        if (isCancelled) {
          return;
        }

        const nextMessages = Array.isArray(result.data) ? result.data : [];

        setMessagesByConversation((previousValue) => ({
          ...previousValue,
          [selectedConversationId]: nextMessages,
        }));
        setLoadedThreads((previousValue) => ({
          ...previousValue,
          [selectedConversationId]: true,
        }));
      } catch (error) {
        if (!isCancelled) {
          setNotice(error.message || "Could not load messages for this conversation.");
        }
      } finally {
        if (!isCancelled) {
          setIsThreadLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.id, selectedConversationId, selectedConversationIsLoaded]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    const socket = io(SOCKET_BASE_URL, {
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("online");
      socket.emit("join", currentUser.id);
    });

    socket.on("disconnect", () => {
      setSocketStatus("offline");
    });

    socket.on("connect_error", () => {
      setSocketStatus("offline");
    });

    socket.on("newMessage", (payload) => {
      const incomingMessage = payload?.message;
      const incomingConversationId = incomingMessage?.conversationId;

      if (!incomingMessage || !incomingConversationId) {
        return;
      }

      const conversationId = String(incomingConversationId);

      setMessagesByConversation((previousValue) => {
        const existingThread = previousValue[conversationId] || [];

        if (existingThread.some((item) => item._id === incomingMessage._id)) {
          return previousValue;
        }

        return {
          ...previousValue,
          [conversationId]: [...existingThread, incomingMessage],
        };
      });

      setConversations((previousValue) => {
        const existingConversation = previousValue.find((item) => item._id === conversationId);
        const inferredMembers =
          existingConversation?.members ||
          [incomingMessage.senderId, incomingMessage.receiverId].filter(Boolean);

        return upsertConversation(previousValue, {
          _id: conversationId,
          members: inferredMembers,
          lastMessage: incomingMessage.text,
          updatedAt: incomingMessage.createdAt,
        });
      });

      if (selectedConversationRef.current !== conversationId) {
        setUnreadByConversation((previousValue) => ({
          ...previousValue,
          [conversationId]: (previousValue[conversationId] || 0) + 1,
        }));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketStatus("offline");
    };
  }, [currentUser?.id]);

  const usersById = useMemo(() => {
    return new Map(users.map((item) => [item._id, item]));
  }, [users]);

  const conversationsWithDetails = useMemo(() => {
    if (!currentUser?.id) {
      return [];
    }

    return conversations.map((conversation) => {
      const partnerId = conversation.members?.find(
        (memberId) => String(memberId) !== String(currentUser.id),
      );
      const partner = usersById.get(partnerId);

      return {
        ...conversation,
        partnerId,
        partnerName: partner?.name || partner?.username || "Unknown user",
        partnerHandle: partner?.username || partnerId?.slice(-6) || "unknown",
      };
    });
  }, [conversations, currentUser?.id, usersById]);

  const selectedConversation = useMemo(() => {
    return conversationsWithDetails.find((item) => item._id === selectedConversationId) || null;
  }, [conversationsWithDetails, selectedConversationId]);

  const activeMessages =
    (selectedConversationId && messagesByConversation[selectedConversationId]) || [];

  useEffect(() => {
    messageTailRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversationId, activeMessages.length]);

  const handleChangeAuthForm = (event) => {
    const { name, value } = event.target;

    setAuthForm((previousValue) => ({
      ...previousValue,
      [name]: value,
    }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setIsAuthLoading(true);
    setNotice("");

    const payload =
      authMode === "signup"
        ? {
            name: authForm.name.trim(),
            username: authForm.username.trim(),
            email: authForm.email.trim(),
            password: authForm.password,
          }
        : {
            email: authForm.email.trim(),
            password: authForm.password,
          };

    try {
      const endpoint = authMode === "signup" ? "/auth/signup" : "/auth/signin";
      const result = await apiRequest(endpoint, {
        method: "POST",
        body: payload,
      });

      setCurrentUser(result.data || null);
      setAuthForm(emptyAuthForm);
      setNotice(result.message || "Authentication complete.");
    } catch (error) {
      setNotice(error.message || "Authentication failed.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const startConversation = async (receiverId) => {
    if (!currentUser?.id || !receiverId || receiverId === currentUser.id) {
      return;
    }

    setNotice("");

    try {
      const result = await apiRequest("/conversations", {
        method: "POST",
        body: { receiverId },
      });

      const nextConversation = result.data;

      setConversations((previousValue) => upsertConversation(previousValue, nextConversation));
      setSelectedConversationId(nextConversation?._id || null);
    } catch (error) {
      setNotice(error.message || "Could not start a conversation with that user.");
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!selectedConversationId || !messageDraft.trim()) {
      return;
    }

    const trimmedMessage = messageDraft.trim();
    setMessageDraft("");
    setIsSending(true);

    try {
      const result = await apiRequest("/messages", {
        method: "POST",
        body: {
          conversationId: selectedConversationId,
          text: trimmedMessage,
        },
      });

      const createdMessage = result.data;

      setMessagesByConversation((previousValue) => {
        const existingThread = previousValue[selectedConversationId] || [];

        if (existingThread.some((item) => item._id === createdMessage._id)) {
          return previousValue;
        }

        return {
          ...previousValue,
          [selectedConversationId]: [...existingThread, createdMessage],
        };
      });

      setLoadedThreads((previousValue) => ({
        ...previousValue,
        [selectedConversationId]: true,
      }));

      setConversations((previousValue) =>
        upsertConversation(previousValue, {
          _id: selectedConversationId,
          members: selectedConversation?.members,
          lastMessage: createdMessage.text,
          updatedAt: createdMessage.createdAt,
        }),
      );
    } catch (error) {
      setMessageDraft(trimmedMessage);
      setNotice(error.message || "Could not send your message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleLocalSignOut = () => {
    setCurrentUser(null);
    setUsers([]);
    setConversations([]);
    setSelectedConversationId(null);
    setMessagesByConversation({});
    setLoadedThreads({});
    setUnreadByConversation({});
    setMessageDraft("");

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setSocketStatus("offline");
    setNotice("Signed out on this device.");
  };

  if (!currentUser) {
    return (
      <main className="chat-app auth-mode">
        <section className="auth-shell">
          <article className="brand-card">
            <p className="eyebrow">Realtime chat workspace</p>
            <h1>Bring your backend to life.</h1>
            <p>
              This interface connects directly to your existing auth, conversations, messages,
              and socket events.
            </p>
            <div className="brand-pills">
              <span>Cookie auth</span>
              <span>1:1 conversations</span>
              <span>Socket delivery</span>
            </div>
          </article>

          <article className="auth-card">
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                className={authMode === "signin" ? "active" : ""}
                onClick={() => setAuthMode("signin")}
                type="button"
              >
                Sign in
              </button>
              <button
                className={authMode === "signup" ? "active" : ""}
                onClick={() => setAuthMode("signup")}
                type="button"
              >
                Create account
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === "signup" ? (
                <>
                  <label>
                    Name
                    <input
                      name="name"
                      onChange={handleChangeAuthForm}
                      required
                      type="text"
                      value={authForm.name}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      name="username"
                      onChange={handleChangeAuthForm}
                      required
                      type="text"
                      value={authForm.username}
                    />
                  </label>
                </>
              ) : null}

              <label>
                Email
                <input
                  name="email"
                  onChange={handleChangeAuthForm}
                  required
                  type="email"
                  value={authForm.email}
                />
              </label>

              <label>
                Password
                <input
                  name="password"
                  onChange={handleChangeAuthForm}
                  required
                  type="password"
                  value={authForm.password}
                />
              </label>

              <button className="cta-button" disabled={isAuthLoading} type="submit">
                {isAuthLoading
                  ? "Please wait..."
                  : authMode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            {notice ? <p className="notice-message">{notice}</p> : null}
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="chat-app">
      <section className="app-frame">
        <header className="app-topbar">
          <div>
            <p className="eyebrow">Connected as</p>
            <h2>{currentUser.username}</h2>
          </div>

          <div className="topbar-actions">
            <span className={`socket-indicator ${socketStatus}`}>{socketStatus}</span>
            <button className="secondary-button" onClick={handleLocalSignOut} type="button">
              Sign out
            </button>
          </div>
        </header>

        {notice ? <p className="notice-message in-app">{notice}</p> : null}

        <div className="app-layout">
          <aside className="sidebar">
            <section className="panel">
              <div className="panel-heading">
                <h3>People</h3>
                <span>{users.length}</span>
              </div>

              <ul className="user-list">
                {users.length === 0 ? <li className="muted-text">No other users found.</li> : null}

                {users.map((user) => (
                  <li key={user._id}>
                    <button
                      className="list-button"
                      onClick={() => startConversation(user._id)}
                      type="button"
                    >
                      <span className="list-title">{user.name || user.username}</span>
                      <span className="list-meta">@{user.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel grow">
              <div className="panel-heading">
                <h3>Conversations</h3>
                <span>{conversationsWithDetails.length}</span>
              </div>

              <ul className="conversation-list">
                {isAppLoading ? <li className="muted-text">Loading conversations...</li> : null}

                {!isAppLoading && conversationsWithDetails.length === 0 ? (
                  <li className="muted-text">Pick a user above to start your first chat.</li>
                ) : null}

                {conversationsWithDetails.map((conversation) => (
                  <li key={conversation._id}>
                    <button
                      className={`list-button conversation-item ${
                        conversation._id === selectedConversationId ? "active" : ""
                      }`}
                      onClick={() => setSelectedConversationId(conversation._id)}
                      type="button"
                    >
                      <span className="list-title">{conversation.partnerName}</span>
                      <span className="list-meta">{conversation.lastMessage || "No messages yet"}</span>
                      {unreadByConversation[conversation._id] ? (
                        <span className="badge">{unreadByConversation[conversation._id]}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </aside>

          <section className="thread">
            {selectedConversation ? (
              <>
                <header className="thread-header">
                  <h3>{selectedConversation.partnerName}</h3>
                  <p>@{selectedConversation.partnerHandle}</p>
                </header>

                <div className="thread-body">
                  {isThreadLoading ? <p className="muted-text">Loading messages...</p> : null}

                  {!isThreadLoading && activeMessages.length === 0 ? (
                    <p className="muted-text">No messages yet. Send the first one.</p>
                  ) : null}

                  {activeMessages.map((message) => {
                    const isCurrentUserMessage = String(message.senderId) === String(currentUser.id);

                    return (
                      <article
                        className={`message-row ${isCurrentUserMessage ? "self" : "other"}`}
                        key={message._id}
                      >
                        <p className="message-bubble">{message.text}</p>
                        <time>{formatMessageTime(message.createdAt)}</time>
                      </article>
                    );
                  })}

                  <div ref={messageTailRef} />
                </div>

                <form className="composer" onSubmit={handleSendMessage}>
                  <textarea
                    disabled={isSending}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder="Type your message"
                    rows={1}
                    value={messageDraft}
                  />
                  <button className="cta-button" disabled={isSending || !messageDraft.trim()} type="submit">
                    {isSending ? "Sending..." : "Send"}
                  </button>
                </form>
              </>
            ) : (
              <div className="empty-thread">
                <h3>Select a conversation</h3>
                <p>Start with someone from the People list to begin chatting.</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
