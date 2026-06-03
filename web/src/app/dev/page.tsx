import { redirect } from "next/navigation";
import { DevPlayground } from "@/components/DevPlayground";
import { HypothesisInspector } from "@/components/HypothesisInspector";

export default function DevPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }
  return (
    <>
      <DevPlayground />
      <HypothesisInspector />
    </>
  );
}
