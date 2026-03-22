import mongoose from "mongoose";

const globalMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

globalMessageSchema.index({ createdAt: -1 });

const GlobalMessage = mongoose.model("GlobalMessage", globalMessageSchema);

export default GlobalMessage;
