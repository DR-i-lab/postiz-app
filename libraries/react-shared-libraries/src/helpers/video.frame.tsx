'use client';

import { FC } from 'react';
export const VideoFrame: FC<{
  url: string;
  autoplay?: boolean;
  // the video's cover, shown instead of its first frame
  poster?: string;
}> = (props) => {
  const { url } = props;
  return (
    <video
      className="w-full h-full object-cover rounded-[4px]"
      src={url + '#t=0.1'}
      poster={props.poster || undefined}
      preload="metadata"
      autoPlay={!!props?.autoplay}
    />
  );
};
