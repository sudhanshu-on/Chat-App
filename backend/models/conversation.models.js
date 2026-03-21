import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: String,
    },
  },
  { timestamps: true },
);

conversationSchema.pre("validate", async function () {
  if (!Array.isArray(this.members)) {
    return next(new Error("Conversation members must be an array"));
  }

  if (this.members.length !== 2) {
    return next(new Error("A conversation must have exactly 2 members"));
  }

  this.members = [...this.members].sort((a, b) =>
    a.toString().localeCompare(b.toString()),
  );

  if (this.members[0].toString() === this.members[1].toString()) {
    return next(new Error("Conversation members must be different users"));
  }
});

// Unique pair index for 1:1 conversations.
conversationSchema.index(
  { "members.0": 1, "members.1": 1 },
  { unique: true, name: "unique_conversation_members_pair" },
);

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
