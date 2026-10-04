"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SkeletonLines } from "@/components/patterns";

/**
 * Voice entry is now a dialog on the Collection page. This route stays so old
 * links and bookmarks land in the same place.
 */
export default function VoiceEntryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/collection?add=voice");
  }, [router]);
  return <SkeletonLines lines={4} />;
}
