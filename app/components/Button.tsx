export default function Button({ children }: { children: React.ReactNode }) {
  return (
    <button
      style={{
        backgroundColor: "#d9d9d9",
        color: "#000000",
        borderRadius: "8px",
      }}
      className="py-2.5 px-7.5"
    >
      {children ?? "Button"}
    </button>
  );
}
