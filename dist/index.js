"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const products_1 = require("./routes/products");
const app = (0, fastify_1.default)({ logger: true });
app.register(cors_1.default, {
    origin: "http://localhost:3000",
});
app.register(products_1.productRoutes);
app.listen({ port: 3001, host: "0.0.0.0" }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log("🚀 Server running at http://localhost:3001");
});
