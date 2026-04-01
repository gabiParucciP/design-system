import Button from "./components/Button";

export default function Home() {
  return (
    <div>
      <Button onClick={() => alert("Button clicked!")}>Click Me</Button>
    </div>
  );
}
