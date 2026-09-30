import React from "react";

interface PageBackgroundProps {
  imageUrl: string;
  overlayClassName?: string; // Optional class to override the overlay (e.g., bg-black/60)
}

export function PageBackground({ imageUrl, overlayClassName = "bg-black/60" }: PageBackgroundProps) {
  return (
    <div className="fixed inset-0 -z-10 h-[100vh] w-[100vw] overflow-hidden">
      {/* Background Image */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      
      {/* Overlay to ensure text readability */}
      <div className={`absolute inset-0 ${overlayClassName} backdrop-blur-[2px]`} />
    </div>
  );
}
