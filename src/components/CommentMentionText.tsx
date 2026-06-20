import * as React from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import { UsernameLink } from './UsernameLink';
import {
  buildMentionLookup,
  splitCommentTextWithMentions,
  type MentionUser,
} from '../utils/commentMentions';
import { usernameClaimDocId } from '../utils/usernameSearch';

type Props = {
  text: string;
  mentionedUsers?: MentionUser[];
  style?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
};

export const CommentMentionText = React.memo(function CommentMentionText({
  text,
  mentionedUsers,
  style,
  mentionStyle,
}: Props) {
  const lookup = React.useMemo(() => buildMentionLookup(mentionedUsers), [mentionedUsers]);
  const parts = React.useMemo(() => splitCommentTextWithMentions(text), [text]);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {parts.map((part, index) => {
        if (part.kind === 'text') {
          return (
            <Text key={`t-${index}`} style={style}>
              {part.value}
            </Text>
          );
        }
        const user = lookup.get(usernameClaimDocId(part.username));
        if (user) {
          return (
            <UsernameLink
              key={`m-${index}`}
              uid={user.uid}
              username={user.username}
              style={[style, mentionStyle]}
            />
          );
        }
        return (
          <Text key={`m-${index}`} style={[style, mentionStyle]}>
            @{part.username}
          </Text>
        );
      })}
    </View>
  );
});
