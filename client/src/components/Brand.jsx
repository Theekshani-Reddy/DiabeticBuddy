export default function Brand() {
  return (
    <div className="brand" aria-label="Sweety, blood glucose tracker">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M16 5c-3 4-8 9-8 14a8 8 0 0 0 16 0c0-5-5-10-8-14Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 19c0 2 1.4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span>Sweety</span>
    </div>
  );
}
