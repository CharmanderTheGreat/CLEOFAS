import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Nothing here</h1>
      <p className="mt-2 text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="btn-primary mt-6">
        Back home
      </Link>
    </div>
  );
}
