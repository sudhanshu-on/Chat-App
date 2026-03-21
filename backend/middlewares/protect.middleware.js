import jwt from "jsonwebtoken";

const protect = (req, res, next) => {
  const token = req.cookies.accessToken;

  if (!token) return res.status(401).json({ msg: "No token" });

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;

  next();
};

export default protect;