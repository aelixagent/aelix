import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { REQUEST_ACCESS_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Request Access",
  description: "Request gated access to the AELIX desk and wallet pre-order list.",
};

export default function Page() {
  redirect(REQUEST_ACCESS_URL);
}
