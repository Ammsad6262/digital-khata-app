import { notFound } from "next/navigation";

/**
 * The style guide at /preview is a development-only QA surface.
 * It renders mock data and is deliberately excluded from the auth gate,
 * so make sure it can never be reached in a production build.
 */
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}