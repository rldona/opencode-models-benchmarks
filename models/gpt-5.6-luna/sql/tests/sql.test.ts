import { describe, expect, it } from "vitest";
import { executeSelect, type SqlTables } from "../src/index";

function table(columns: string[], rows: (number | string | null)[][]): SqlTables[string] {
  return { columns, rows };
}

describe("in-memory SELECT engine", () => {
  it("preserves three-valued logic in NOT IN", () => {
    const result = executeSelect(
      { values: table(["value"], [[1], [2], [null]]) },
      "SELECT value, value NOT IN (1, NULL) AS matches FROM values ORDER BY value",
    );

    expect(result).toEqual({
      columns: ["value", "matches"],
      rows: [
        [null, null],
        [1, 0],
        [2, null],
      ],
    });
  });

  it("ignores NULL in aggregates and returns NULL for an empty SUM", () => {
    const result = executeSelect(
      { values: table(["value"], [[1], [null], [2]]) },
      `
        SELECT COUNT(value) AS count_value,
               COUNT(DISTINCT value) AS distinct_value,
               SUM(value) AS total,
               AVG(value) AS average,
               MIN(value) AS minimum,
               MAX(value) AS maximum
        FROM values
      `,
    );

    expect(result.rows).toEqual([[2, 2, 3, 1.5, 1, 2]]);

    const empty = executeSelect(
      { values: table(["value"], []) },
      "SELECT COUNT(value) AS c, SUM(value) AS s FROM values",
    );
    expect(empty.rows).toEqual([[0, null]]);

    const star = executeSelect(
      { values: table(["value"], [[1], [2]]) },
      "SELECT COUNT(*) FROM values",
    );
    expect(star).toEqual({ columns: ["COUNT(*)"], rows: [[2]] });
  });

  it("keeps unmatched rows in a LEFT OUTER JOIN", () => {
    const result = executeSelect(
      {
        employees: table(
          ["id", "name"],
          [
            [1, "Ana"],
            [2, "Luis"],
          ],
        ),
        departments: table(
          ["employee_id", "department"],
          [[1, "engineering"]],
        ),
      },
      `
        SELECT e.id, d.department
        FROM employees AS e
        LEFT OUTER JOIN departments d ON e.id = d.employee_id
        ORDER BY e.id
      `,
    );

    expect(result).toEqual({
      columns: ["id", "department"],
      rows: [
        [1, "engineering"],
        [2, null],
      ],
    });
  });

  it("groups rows and applies HAVING", () => {
    const result = executeSelect(
      {
        sales: table(
          ["category", "amount"],
          [
            ["a", 3],
            ["a", 4],
            ["b", 2],
            ["b", null],
          ],
        ),
      },
      `
        SELECT category AS category, SUM(amount) AS total, COUNT(*) AS count
        FROM sales
        GROUP BY category
        HAVING SUM(amount) >= 3
        ORDER BY category
      `,
    );

    expect(result).toEqual({
      columns: ["category", "total", "count"],
      rows: [["a", 7, 2]],
    });
  });

  it("orders NULL values first in ASC and applies LIMIT/OFFSET", () => {
    const result = executeSelect(
      { values: table(["value"], [[2], [null], [1], [3]]) },
      "SELECT value FROM values ORDER BY value ASC LIMIT 2 OFFSET 1",
    );

    expect(result).toEqual({ columns: ["value"], rows: [[1], [2]] });

    const descending = executeSelect(
      { values: table(["value"], [[2], [null], [1]]) },
      "SELECT value FROM values ORDER BY value DESC",
    );
    expect(descending.rows).toEqual([[2], [1], [null]]);
  });

  it("distinguishes integer division from real division", () => {
    const result = executeSelect(
      {},
      "SELECT 7 / 2 AS integer_division, -7 / 2 AS negative_division, 7 / 2.0 AS real_division",
    );

    expect(result).toEqual({
      columns: ["integer_division", "negative_division", "real_division"],
      rows: [[3, -3, 3.5]],
    });
  });

  it("supports aliases, CASE, scalar functions, quoted names, and DISTINCT", () => {
    const result = executeSelect(
      {
        people: table(
          ["ID", "name", "score"],
          [
            [1, "ALICE", 8],
            [2, "bob", 8],
            [3, "Zoë", null],
          ],
        ),
      },
      `
        SELECT DISTINCT "name" AS person,
               CASE WHEN score IS NULL THEN 'missing'
                    WHEN score >= 8 THEN 'pass'
                    ELSE 'fail' END AS status,
               LOWER(name) || ':' || LENGTH(name) AS label
        FROM people
        ORDER BY person
      `,
    );

    expect(result).toEqual({
      columns: ["person", "status", "label"],
      rows: [
        ["ALICE", "pass", "alice:5"],
        ["Zoë", "missing", "zoë:3"],
        ["bob", "pass", "bob:3"],
      ],
    });
  });

  it("supports stars, comma joins, no-FROM expressions, and operator predicates", () => {
    const result = executeSelect(
      {
        first: table(["id", "text"], [[1, "Abc"], [2, "xyz"]]),
        second: table(["id"], [[10], [20]]),
      },
      `
        SELECT first.*, second.id AS second_id,
               1 + 2 * 3 AS arithmetic,
               'a' || 'b' AS concatenated,
               4 BETWEEN 1 AND 5 AS between_value,
               'Abc' LIKE 'a_c' AS like_value
        FROM first, second
        WHERE first.id = 1
        ORDER BY second_id DESC
      `,
    );

    expect(result.columns).toEqual([
      "id",
      "text",
      "second_id",
      "arithmetic",
      "concatenated",
      "between_value",
      "like_value",
    ]);
    expect(result.rows).toEqual([
      [1, "Abc", 20, 7, "ab", 1, 1],
      [1, "Abc", 10, 7, "ab", 1, 1],
    ]);

    expect(executeSelect({}, "SELECT 1 + 1 AS answer;").rows).toEqual([[2]]);
  });

  it("implements scalar functions and NULL-aware predicates", () => {
    const result = executeSelect(
      {
        values: table(
          ["number", "text"],
          [
            [-1.25, "AbC"],
            [2, "foo"],
            [null, null],
          ],
        ),
      },
      `
        SELECT ABS(number) AS absolute,
               ROUND(number, 1) AS rounded,
               LOWER(text) AS lower_text,
               UPPER(text) AS upper_text,
               LENGTH(number) AS number_length,
               COALESCE(number, 99) AS coalesced,
               IFNULL(number, 88) AS ifnulled,
               NULLIF(number, 2) AS nulled,
               number IS NULL AS is_null,
               number IS NOT NULL AS is_not_null,
               number NOT BETWEEN 0 AND 3 AS outside,
               text NOT LIKE 'a%' AS not_like,
               number IN (NULL, 2) AS in_value
        FROM values
      `,
    );

    expect(result.rows).toEqual([
      [1.25, -1.3, "abc", "ABC", 5, -1.25, -1.25, -1.25, 0, 1, 1, 0, null],
      [2, 2, "foo", "FOO", 1, 2, 2, null, 0, 1, 0, 1, 1],
      [null, null, null, null, null, 99, 88, null, 1, 0, null, null, null],
    ]);
  });

  it("uses SQLite operator precedence and three-valued boolean logic", () => {
    const result = executeSelect(
      {},
      `
        SELECT 1 + 2 * 3 AS arithmetic,
               1 || 2 * 3 AS concatenation_precedence,
               NOT 1 = 1 AS not_precedence,
               NULL AND 0 AS null_and_false,
               NULL OR 1 AS null_or_true,
               NULL = 1 AS null_comparison
      `,
    );

    expect(result.rows).toEqual([[7, 36, 0, 0, 1, null]]);
  });

  it("rejects invalid references, aggregate misuse, unknown functions, and bad positions", () => {
    const tables = {
      left_table: table(["id"], [[1]]),
      right_table: table(["id"], [[1]]),
    };

    expect(() => executeSelect(tables, "SELECT missing FROM left_table")).toThrow();
    expect(() =>
      executeSelect(tables, "SELECT left_table.id FROM left_table, right_table"),
    ).not.toThrow();
    expect(() => executeSelect(tables, "SELECT id FROM left_table, right_table")).toThrow(/ambiguous/);
    expect(() => executeSelect(tables, "SELECT SUM(id) FROM left_table WHERE id = 1")).not.toThrow();
    expect(() => executeSelect(tables, "SELECT SUM(id) FROM left_table WHERE SUM(id) > 0")).toThrow();
    expect(() => executeSelect(tables, "SELECT unknown_function(id) FROM left_table")).toThrow();
    expect(() => executeSelect(tables, "SELECT id FROM left_table ORDER BY 2")).toThrow(/range/);
    expect(() =>
      executeSelect(
        { empty: table(["id"], []), other: table(["id"], []) },
        "SELECT id FROM empty, other",
      ),
    ).toThrow(/ambiguous/);
  });
});

describe("performance", () => {
  it("hash-joins 100,000 rows and groups them in 5,000 groups in under two seconds each", () => {
    const largeRows = Array.from({ length: 100_000 }, (_, index) => [
      index,
      index % 5_000,
      1,
    ] as (number | string | null)[]);
    const smallRows = Array.from({ length: 5_000 }, (_, index) => [
      index,
      `group-${index}`,
    ] as (number | string | null)[]);
    const tables = {
      large_table: table(["id", "group_id", "amount"], largeRows),
      small_table: table(["group_id", "label"], smallRows),
    };

    const joinStart = performance.now();
    const joined = executeSelect(
      tables,
      `
        SELECT l.id, s.label
        FROM large_table l
        JOIN small_table s ON l.group_id = s.group_id
      `,
    );
    const joinElapsed = performance.now() - joinStart;

    expect(joined.rows).toHaveLength(100_000);
    expect(joinElapsed).toBeLessThan(2_000);

    const groupStart = performance.now();
    const grouped = executeSelect(
      tables,
      "SELECT group_id, COUNT(*) AS count, SUM(amount) AS total FROM large_table GROUP BY group_id",
    );
    const groupElapsed = performance.now() - groupStart;

    expect(grouped.rows).toHaveLength(5_000);
    expect(groupElapsed).toBeLessThan(2_000);
  }, 10_000);
});
