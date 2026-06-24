import Fastify from "fastify";
import cors from "@fastify/cors";
import { productRoutes } from "./routes/products";
import { cartRoutes } from "./routes/cart";

const app = Fastify({ logger: true });

app.register(cors, {
  origin: ["http://localhost:3000", "https://gmalli-stores.netlify.app"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
});

app.register(productRoutes);
app.register(cartRoutes);

app.listen({ port: 3001, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("🚀 Server running at http://localhost:3001");
});
