export default function RouteLoading({
  children = "A moment for the good things…",
}: {
  children?: React.ReactNode;
}) {
  return (
    <p className="loading-state" role="status">
      {children}
    </p>
  );
}
