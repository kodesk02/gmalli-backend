import { FastifyInstance } from "fastify";
import pool from '../db'

function generatePickupCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "MKT-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function orderRoutes(app: FastifyInstance) {

  app.post("/orders", async (request, reply) => {
    const {
      order_type,
      customer_name,
      customer_email,
      customer_phone,
      address,
      city,
      state,
      items, 
    } = request.body as {
      order_type: "pickup" | "delivery";
      customer_name: string;
      customer_email?: string;
      customer_phone: string;
      address?: string;
      city?: string;
      state?: string;
      items: { product_id: string; quantity: number }[];
    };

    if (!customer_name || !customer_phone || !items?.length) {
      return reply.status(400).send({ 
        error: "Name, phone and items are required" 
      });
    }

    if (order_type === "pickup" && !customer_email) {
      return reply.status(400).send({ 
        error: "Email is required for pickup orders" 
      });
    }

    if (order_type === "delivery" && (!address || !city || !state)) {
      return reply.status(400).send({ 
        error: "Address, city and state are required for delivery orders" 
      });
    }


    const productIds = items.map((item) => item.product_id);
    const productResult = await pool.query(
      `SELECT id, name, price FROM products WHERE id = ANY($1)`,
      [productIds]
    );

    const productMap = new Map(
      productResult.rows.map((p) => [p.id, p])
    );

    // Step 3 — Calculate real total from database prices
    let total_price = 0;
    for (const item of items) {
      const product = productMap.get(item.product_id);
      if (!product) {
        return reply.status(400).send({ 
          error: `Product ${item.product_id} not found` 
        });
      }
      total_price += Number(product.price) * item.quantity;
    }

    let pickup_code = generatePickupCode();
    let codeExists = true;

    while (codeExists) {
      const existing = await pool.query(
        "SELECT id FROM orders WHERE pickup_code = $1",
        [pickup_code]
      );
      if (existing.rows.length === 0) {
        codeExists = false; 
      } else {
        pickup_code = generatePickupCode();
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN"); 

      const orderResult = await client.query(
        `INSERT INTO orders 
          (pickup_code, order_type, customer_name, customer_email, 
           customer_phone, address, city, state, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          pickup_code,
          order_type,
          customer_name,
          customer_email || null,
          customer_phone,
          address || null,
          city || null,
          state || null,
          total_price,
        ]
      );

      const orderId = orderResult.rows[0].id;

      for (const item of items) {
        const product = productMap.get(item.product_id);
        await client.query(
          `INSERT INTO order_items 
            (order_id, product_id, product_name, price, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            orderId,
            item.product_id,
            product.name,
            product.price,
            item.quantity,
          ]
        );
      }

      await client.query("COMMIT"); 

      return reply.status(201).send({
        pickup_code,
        total_price,
        customer_name,
        order_type,
      });

    } catch (err) {
      await client.query("ROLLBACK"); 
      console.error("Order creation failed:", err);
      return reply.status(500).send({ error: "Failed to create order" });
    } finally {
      client.release(); 
    }
  });


  app.get("/orders/:code", async (request, reply) => {
    const { code } = request.params as { code: string };

    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE pickup_code = $1",
      [code.toUpperCase()]
    );

    if (orderResult.rows.length === 0) {
      return reply.status(404).send({ error: "Order not found" });
    }

    const itemsResult = await pool.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [orderResult.rows[0].id]
    );

    return reply.send({
      ...orderResult.rows[0],
      items: itemsResult.rows,
    });
  });
}