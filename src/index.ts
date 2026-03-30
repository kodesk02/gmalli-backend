import Fastify from "fastify";
import cors from "@fastify/cors";
import { productRoutes } from "./routes/products";

const app = Fastify({ logger: true });

app.register(cors, {
  origin: "http://localhost:3000",
});

app.register(productRoutes);

app.listen({ port: 3001, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("🚀 Server running at http://localhost:3001");
});