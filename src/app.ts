import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/apiRouter";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", apiRouter);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

