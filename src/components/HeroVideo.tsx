"use client";

// The looping video behind the landing page's headline.
// The server picks the clip (page.tsx), so the clip's still image is in the HTML and shows at
// once. This component adds the two things only the browser can do: remember which clip was
// shown, and start the video (unless the visitor asked their device for less motion).
import { useEffect, useRef } from "react";
import { HERO_COOKIE, type HeroClip } from "@/lib/heroClips";

const THIRTY_DAYS = 60 * 60 * 24 * 30; // in seconds

export function HeroVideo({ clip }: { clip: HeroClip }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Remember this clip, so the server shows the next one on the next visit. A cookie, not
    // localStorage (like the theme): the browser sends cookies along with every page request,
    // and it is the server that picks the clip.
    document.cookie = `${HERO_COOKIE}=${clip.id}; path=/; max-age=${THIRTY_DAYS}; samesite=lax`;

    // "Reduce motion" is a device setting for people who feel sick from moving backgrounds.
    // For them we never start the video: the still image stays.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // play() fails when the browser blocks autoplay (a phone in low-power mode, for example).
    // That's fine: the still image stays.
    videoRef.current?.play().catch(() => {});
  }, [clip.id]);

  return (
    <video
      ref={videoRef}
      src={`/hero/${clip.id}.mp4`}
      poster={`/hero/${clip.id}.jpg`}
      // muted: browsers only let a video start by itself if it is silent. playsInline: on phones,
      // play in place instead of opening the full-screen player. preload="none": don't download
      // the video until play() asks for it (so "reduce motion" visitors never download it).
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
