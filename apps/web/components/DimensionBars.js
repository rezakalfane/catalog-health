export default function DimensionBars({ averages }) {
  return (
    <div>
      {Object.entries(averages).map(([dim, value]) => (
        <div className="dim-row" key={dim}>
          <span className="dim-name">{dim}</span>
          <span className="dim-track">
            <span className="dim-fill" style={{ width: `${value}%` }} />
          </span>
          <span className="dim-val">{value}</span>
        </div>
      ))}
    </div>
  );
}
