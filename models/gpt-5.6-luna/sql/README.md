# In-memory SQL SELECT

The public API is `executeSelect(tables, sql)` (also exported as `executeSQL`).

```ts
const result = executeSelect(
  { users: { columns: ["id"], rows: [[1], [2]] } },
  "SELECT id FROM users ORDER BY id",
);
```

Run the test suite with `npm test`.
