import { FastifyInstance } from "fastify";
import pool from "../db";

export async function productRoutes(app: FastifyInstance) {
  app.get("/products", async (request, reply) => {
    const { category, brand, tag, priceRange, inStock } = request.query as {
      category?: string;
      brand?: string;
      tag?: string;
      priceRange?: string;
      inStock?: string;
    };

    let query = "SELECT * FROM products WHERE 1=1";
    const params: unknown[] = [];
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

    const result = await pool.query(query, params);
    return reply.send(result.rows);
  });

  app.get("/products/categories", async (_request, reply) => {
    const result = await pool.query(
      "SELECT DISTINCT category FROM products ORDER BY category",
    );
    return reply.send(result.rows.map((r) => r.category));
  });

  app.get("/products/filters", async (request, reply) => {
    const { category } = request.query as { category?: string };

    const brandsResult = await pool.query(
      `SELECT DISTINCT brand FROM products 
     WHERE LOWER(category) = LOWER($1) 
     ORDER BY brand`,
      [category],
    );

    const priceRangesResult = await pool.query(
      `SELECT DISTINCT price_range FROM products 
     WHERE LOWER(category) = LOWER($1)`,
      [category],
    );

    const tagsResult = await pool.query(
      `SELECT DISTINCT UNNEST(tags) as tag FROM products 
     WHERE LOWER(category) = LOWER($1) 
     ORDER BY tag`,
      [category],
    );

    return reply.send({
      brands: brandsResult.rows.map((r) => r.brand),
      priceRanges: priceRangesResult.rows.map((r) => r.price_range),
      tags: tagsResult.rows.map((r) => r.tag),
    });
  });

  app.get("/products/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await pool.query("SELECT * FROM products WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: "Product not found" });
    }

    return reply.send(result.rows[0]);
  });
}
