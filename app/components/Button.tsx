export default function Button({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-primary hover:bg-secondary text-label py-2.5 px-7.5 rounded-lg"
    >
      {children}
    </button>
  );
}
