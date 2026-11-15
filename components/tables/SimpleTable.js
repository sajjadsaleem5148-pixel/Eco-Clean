// columns: [{ key, label }]   rows: [{ [key]: value }]
export default function SimpleTable({ columns, rows, caption }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-gray-200 text-gray-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="py-2 pr-4">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-100">
              {columns.map((c) => (
                <td key={c.key} className="py-2 pr-4">{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
