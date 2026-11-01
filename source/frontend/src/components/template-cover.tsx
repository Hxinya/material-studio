"use client";

import Image from "next/image";
import { useState } from "react";

export function TemplateCover({ src, title, priority = false, sizes }: { src: string; title: string; priority?: boolean; sizes: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return failedSrc === src
    ? <div className="flex h-full min-h-48 items-center justify-center bg-[#202b20] p-8 text-center text-sm text-[#b8c5ac]">{title} · 示例封面暂不可用</div>
    : <Image src={src} alt={`${title}示例插画`} width={720} height={900} unoptimized priority={priority} sizes={sizes} onError={() => setFailedSrc(src)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />;
}
