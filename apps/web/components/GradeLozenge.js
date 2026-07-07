export default function GradeLozenge({ grade, small = false }) {
  return (
    <span className={`lozenge ${grade} ${small ? "small" : ""}`} title={`Grade ${grade}`}>
      {grade}
    </span>
  );
}
