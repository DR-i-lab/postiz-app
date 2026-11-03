import React, { CSSProperties } from 'react';

// The logo file is white on transparent: used as a mask, it takes the text
// colour of its parent, so it reads on both the dark and the light theme.
export const DriLogo = ({
  width,
  height,
  className,
}: {
  width: number;
  height: number;
  className?: string;
}) => {
  const style: CSSProperties = {
    width,
    height,
    backgroundColor: 'currentColor',
    WebkitMaskImage: 'url(/dri-logo.svg)',
    maskImage: 'url(/dri-logo.svg)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  };
  return (
    <span
      role="img"
      aria-label="DR-I Social Publisher"
      className={`inline-block shrink-0 ${className || ''}`}
      style={style}
    />
  );
};
