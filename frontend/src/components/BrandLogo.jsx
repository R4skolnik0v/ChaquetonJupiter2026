import React from "react";

export default function BrandLogo() {
  return (
    <img
      className="brand-logo"
      src={`${import.meta.env.BASE_URL}brand/acordia-logo-v1.png`}
      alt="Acordia"
      width={1983}
      height={793}
    />
  );
}
