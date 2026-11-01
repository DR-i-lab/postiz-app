import { FC } from 'react';
import { clsx } from 'clsx';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
export const VideoOrImage: FC<{
  src: string;
  autoplay: boolean;
  isContain?: boolean;
  imageClassName?: string;
  videoClassName?: string;
  // the video's cover: with one the video doesn't autoplay, so the cover
  // stays on screen until it is played
  poster?: string;
  controls?: boolean;
}> = (props) => {
  const {
    src,
    autoplay,
    isContain,
    imageClassName,
    videoClassName,
    poster,
    controls,
  } = props;
  if (hasExtension(src, 'mp4')) {
    return (
      <video
        src={src}
        poster={poster || undefined}
        autoPlay={autoplay && !poster}
        controls={!!controls}
        className={clsx('w-full h-full', videoClassName)}
        muted={true}
        loop={true}
      />
    );
  }
  return (
    <img
      className={clsx(
        isContain ? 'object-contain' : 'object-cover',
        'w-full h-full',
        imageClassName
      )}
      src={src}
    />
  );
};
