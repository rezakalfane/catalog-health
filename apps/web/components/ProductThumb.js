/**
 * Small product thumbnail for tables. Renders a fixed-size placeholder
 * (image-off glyph) when there's no image so rows stay aligned.
 */
export default function ProductThumb({ src, alt = "", size = 28 }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className="prod-thumb"
      />
    );
  }
  return (
    <span
      className="prod-thumb prod-thumb--empty"
      style={{ width: size, height: size }}
      aria-hidden="true"
      title="No image"
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </span>
  );
}
