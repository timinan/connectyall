import type { IconType } from 'react-icons';
import { LuMail, LuPhone, LuGlobe } from 'react-icons/lu';
import { FaLinkedin, FaInstagram, FaFacebookMessenger } from 'react-icons/fa6';
import {
  SiTelegram, SiX, SiWhatsapp, SiWechat, SiLine,
} from 'react-icons/si';

export type ChannelKind =
  | 'email' | 'phone'
  | 'telegram' | 'x' | 'linkedin' | 'website'
  | 'whatsapp' | 'wechat' | 'line'
  | 'instagram' | 'messenger';

type IconConfig = { Icon: IconType; color: string; label: string };

export const CHANNEL_ICONS: Record<ChannelKind, IconConfig> = {
  email:     { Icon: LuMail,              color: '#0F0F0F', label: 'Email'     },
  phone:     { Icon: LuPhone,              color: '#0F0F0F', label: 'Phone'     },
  telegram:  { Icon: SiTelegram,           color: '#26A5E4', label: 'Telegram'  },
  x:         { Icon: SiX,                  color: '#0F0F0F', label: 'X'         },
  linkedin:  { Icon: FaLinkedin,           color: '#0A66C2', label: 'LinkedIn'  },
  website:   { Icon: LuGlobe,              color: '#0F0F0F', label: 'Website'   },
  whatsapp:  { Icon: SiWhatsapp,           color: '#25D366', label: 'WhatsApp'  },
  wechat:    { Icon: SiWechat,             color: '#07C160', label: 'WeChat'    },
  line:      { Icon: SiLine,               color: '#06C755', label: 'Line'      },
  instagram: { Icon: FaInstagram,          color: '#E4405F', label: 'Instagram' },
  messenger: { Icon: FaFacebookMessenger,  color: '#0084FF', label: 'Messenger' },
};

export function ChannelIcon({ kind, size = 18 }: { kind: ChannelKind; size?: number }) {
  const { Icon, color } = CHANNEL_ICONS[kind];
  return <Icon size={size} color={color} />;
}

// What action button to show for this channel:
//   'send'  — opens a direct message compose (deep link)
//   'visit' — opens a profile / external page
//   'copy'  — no URL scheme; copy the value to clipboard so user can paste it
//
// Notes on the trickier ones:
//   - Instagram: `ig.me/m/<handle>` opens DM directly (official Meta deep link)
//   - Telegram:  `t.me/<handle>` only opens the profile; Telegram has no public
//     URL scheme for "compose a message to <handle>" for regular users.
//   - X (Twitter): DM compose requires a numeric user ID, which we don't have
//     from the handle, so we can only link to the profile.
//   - WeChat: no usable web URL scheme; meaningful action is to copy the ID.
export function channelAction(kind: ChannelKind): 'send' | 'visit' | 'copy' {
  switch (kind) {
    case 'email':
    case 'phone':
    case 'whatsapp':
    case 'line':
    case 'messenger':
    case 'instagram':
      return 'send';
    case 'telegram':
    case 'x':
    case 'linkedin':
    case 'website':
      return 'visit';
    case 'wechat':
      return 'copy';
  }
}
