export default function Button({ children }: { children: React.ReactNode }) {
  return (
    <button
      onClick={() => console.log("Button clicked!")}
      className="bg-primary hover:bg-secondary text-label py-2.5 px-7.5 rounded-lg"
    >
      {children}
    </button>
  );
}
