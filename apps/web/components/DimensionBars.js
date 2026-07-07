import InfoPopover from "@/components/InfoPopover";

export default function DimensionBars({ averages, infoMap }) {
  return (
    <div>
      {Object.entries(averages).map(([dim, value]) => (
        <div className="dim-row" key={dim}>
          <span className="dim-name">
            {dim}
            {infoMap?.[dim] && (
              <InfoPopover title={`${dim} score`}>{infoMap[dim]}</InfoPopover>
            )}
          </span>
          <span className="dim-track">
            <span className="dim-fill" style={{ width: `${value}%` }} />
          </span>
          <span className="dim-val">{value}</span>
        </div>
      ))}
    </div>
  );
}
