"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRoutes = productRoutes;
const db_1 = __importDefault(require("../db"));
const API_URL = process.env.NEXT_PUBLIC_API_URL;
async function productRoutes(app) {
    app.get(`${API_URL}/products`, async (request, reply) => {
        const { category, brand, tag, priceRange, inStock } = request.query;
        let query = "SELECT * FROM products WHERE 1=1";
        const params = [];
        let i = 1;
        if (category) {
            query += ` AND LOWER(category) = LOWER($${i++})`;
            params.push(category);
        }
        if (brand) {
            query += ` AND LOWER(brand) = LOWER($${i++})`;
            params.push(brand);
        }
        if (tag) {
            query += ` AND tags @> ARRAY[$${i++}]`;
            params.push(tag);
        }
        if (priceRange) {
            query += ` AND price_range = $${i++}`;
            params.push(priceRange);
        }
        if (inStock === "true") {
            query += ` AND in_stock = true`;
        }
        const result = await db_1.default.query(query, params);
        return reply.send(result.rows);
    });
    app.get(`${API_URL}/products/categories`, async (_request, reply) => {
        const result = await db_1.default.query("SELECT DISTINCT category FROM products ORDER BY category");
        return reply.send(result.rows.map((r) => r.category));
    });
    app.get(`${API_URL}/products/filters`, async (request, reply) => {
        const { category } = request.query;
        const brandsResult = await db_1.default.query(`SELECT DISTINCT brand FROM products 
     WHERE LOWER(category) = LOWER($1) 
     ORDER BY brand`, [category]);
        const priceRangesResult = await db_1.default.query(`SELECT DISTINCT price_range FROM products 
     WHERE LOWER(category) = LOWER($1)`, [category]);
        const tagsResult = await db_1.default.query(`SELECT DISTINCT UNNEST(tags) as tag FROM products 
     WHERE LOWER(category) = LOWER($1) 
     ORDER BY tag`, [category]);
        return reply.send({
            brands: brandsResult.rows.map((r) => r.brand),
            priceRanges: priceRangesResult.rows.map((r) => r.price_range),
            tags: tagsResult.rows.map((r) => r.tag),
        });
    });
    app.get(`${API_URL}/products/:id`, async (request, reply) => {
        const { id } = request.params;
        const result = await db_1.default.query("SELECT * FROM products WHERE id = $1", [
            id,
        ]);
        if (result.rows.length === 0) {
            return reply.status(404).send({ error: "Product not found" });
        }
        return reply.send(result.rows[0]);
    });
}
