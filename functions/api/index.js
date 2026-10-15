/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/


export default {
	async fetch(request, env, ctx) {
		return new Response("Hello World!");
	},
};
*/

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // ==========================================
    // 商品 (Product) 接口
    // ==========================================

    // 1. 获取所有商品列表
    if (method === "GET" && url.pathname === "/api/products") {
      const { results } = await env.DB.prepare("SELECT pid,name,price,cost FROM product ORDER BY pid DESC").all();
      return Response.json(results);
    }

    // 2. 新增商品
    if (method === "POST" && url.pathname === "/api/products") {
      const body = await request.json();
      const { name, price, cost, img } = body;

      await env.DB.prepare(
        "INSERT INTO product (name, price, cost, img) VALUES (?, ?, ?, ?)"
      ).bind(name, price, cost, img || null).run();

      return Response.json({ ok: true });
    }

    // 3. 更新商品
    if (method === "PUT" && url.pathname.startsWith("/api/products/")) {
      const pid = url.pathname.split('/').pop();
      const body = await request.json();
      const { name, price, cost, img } = body;

      await env.DB.prepare(
        "UPDATE product SET name = ?, price = ?, cost = ?, img = ? WHERE pid = ?"
      ).bind(name, price, cost, img || null, pid).run();

      return Response.json({ ok: true });
    }

    // 4. 删除商品
    if (method === "DELETE" && url.pathname.startsWith("/api/products/")) {
      const pid = url.pathname.split('/').pop();
      await env.DB.prepare("DELETE FROM product WHERE pid = ?").bind(pid).run();
      return Response.json({ ok: true });
    }


    // ==========================================
    // 销售 (Sale) 接口
    // ==========================================

    // 1. 获取所有销售记录（支持日期过滤）
    if (method === "GET" && url.pathname === "/api/sales") {
      let query = "SELECT s.*, p.name as productName FROM sale s LEFT JOIN product p ON s.pid = p.pid";
      const params = [];
      
      // 支持日期范围过滤
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');
      if (startDate && endDate) {
        query += " WHERE s.date >= ? AND s.date <= ?";
        params.push(startDate, endDate);
      }
      
      query += " ORDER BY s.id DESC";
      
      // 如果没有日期参数，限制20条（保持原有行为）
      if (!startDate) {
        query += " LIMIT 20";
      }
      
      const { results } = await env.DB.prepare(query).bind(...params).all();
      return Response.json(results);
    }

    /* 2. 新增销售记录
    if (method === "POST" && url.pathname === "/api/sales") {
      const body = await request.json();
      const { date, pid, price, number, amount, cost, remark } = body;

      await env.DB.prepare(
        "INSERT INTO sale (date, pid, price, number, amount, cost, remark) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(date, pid, price, number, amount, cost, remark || null).run();

      return Response.json({ ok: true });
    }
    */
    if (method === 'POST' && url.pathname === '/api/sales') {
      const body = await request.json();
      const { date, pid, number, price, amount, cost, remark } = body;

      if (!date || !pid || !number) {
        return new Response(JSON.stringify({ error: '缺少必填字段' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      await env.DB.prepare(
        `INSERT INTO sale (date, pid, number, price, amount, cost, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(date, pid, number, price, amount, cost, remark).run();

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    // 3. 更新销售记录
    if (method === "PUT" && url.pathname.startsWith("/api/sales/")) {
      const id = url.pathname.split('/').pop();
      const body = await request.json();
      const { date, pid, price, number, amount, cost, remark } = body;

      await env.DB.prepare(
        "UPDATE sale SET date = ?, pid = ?, price = ?, number = ?, amount = ?, cost = ?, remark = ? WHERE id = ?"
      ).bind(date, pid, price, number, amount, cost, remark || null, id).run();

      return Response.json({ ok: true });
    }

    // 4. 删除销售记录
    if (method === "DELETE" && url.pathname.startsWith("/api/sales/")) {
      const id = url.pathname.split('/').pop();
      await env.DB.prepare("DELETE FROM sale WHERE id = ?").bind(id).run();
      return Response.json({ ok: true });
    }

    // ==========================================
    // 统计接口
    // ==========================================

    if (method === "GET" && url.pathname === "/api/summary") {
      const type = url.searchParams.get('type');
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');

      if (!startDate || !endDate) {
        return new Response(JSON.stringify({ error: '缺少日期参数' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      let results;

      if (type === 'monthly') {
        // 月汇总表：按月份汇总销售金额和毛利
        const sql = `SELECT 
          strftime('%Y-%m', date) as month,
          SUM(amount) as total_amount,
          SUM(amount - cost) as total_profit
        FROM sale 
        WHERE date >= ? AND date <= ?
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month`;
        results = (await env.DB.prepare(sql).bind(startDate, endDate).all()).results;
      } else if (type === 'daily') {
        // 日汇总表：按日期汇总销售金额和毛利
        const sql = `SELECT 
          date,
          SUM(amount) as total_amount,
          SUM(amount - cost) as total_profit,
          COUNT(*) as count
        FROM sale 
        WHERE date >= ? AND date <= ?
        GROUP BY date
        ORDER BY date`;
        results = (await env.DB.prepare(sql).bind(startDate, endDate).all()).results;
      } else if (type === 'product') {
        // 商品汇总表：按商品汇总销售数量和金额
        const sql = `SELECT 
          p.name as productName,
          p.pid,
          SUM(s.number) as total_number,
          SUM(s.amount) as total_amount,
          SUM(s.amount - s.cost) as total_profit
        FROM sale s
        LEFT JOIN product p ON s.pid = p.pid
        WHERE s.date >= ? AND s.date <= ?
        GROUP BY s.pid, p.name
        ORDER BY total_amount DESC`;
        results = (await env.DB.prepare(sql).bind(startDate, endDate).all()).results;
      } else {
        // list: 明细表（同/api/sales但带日期过滤）
        const sql = `SELECT s.*, p.name as productName FROM sale s 
          LEFT JOIN product p ON s.pid = p.pid 
          WHERE s.date >= ? AND s.date <= ?
          ORDER BY s.id DESC`;
        results = (await env.DB.prepare(sql).bind(startDate, endDate).all()).results;
      }

      return Response.json(results || []);
    }

        return Response.json({ message: "API is running!" });
  },
};
