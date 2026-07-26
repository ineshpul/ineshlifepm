import * as React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { splitCaptionWithHashtags } from '../utils/captionHashtags';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  hashtagStyle?: StyleProp<TextStyle>;
  onPressHashtag?: (tag: string) => void;
};

/** Renders a Best Part caption with `#hashtags` highlighted. */
export const BestPartCaptionText = React.memo(function BestPartCaptionText({
  text,
  style,
  hashtagStyle,
  onPressHashtag,
}: Props) {
  const parts = React.useMemo(() => splitCaptionWithHashtags(text), [text]);

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.kind === 'text') {
          return <Text key={`t-${index}`}>{part.value}</Text>;
        }
        const label = `#${part.tag}`;
        return (
          <Text
            key={`h-${index}-${part.tag}`}
            style={hashtagStyle}
            onPress={onPressHashtag ? () => onPressHashtag(part.tag) : undefined}
          >
            {label}
          </Text>
        );
      })}
    </Text>
  );
});
