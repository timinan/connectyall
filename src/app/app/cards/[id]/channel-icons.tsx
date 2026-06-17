import type { IconType } from 'react-icons';
import { LuMail, LuPhone, LuGlobe } from 'react-icons/lu';
import { FaLinkedin } from 'react-icons/fa6';
import {
  SiTelegram, SiX, SiWhatsapp, SiWechat, SiLine,
} from 'react-icons/si';

export type ChannelKind =
  | 'email' | 'phone'
  | 'telegram' | 'x' | 'linkedin' | 'website'
  | 'whatsapp' | 'wechat' | 'line';

type IconConfig = { Icon: IconType; color: string; label: string };

export const CHANNEL_ICONS: Record<ChannelKind, IconConfig> = {
  email:    { Icon: LuMail,       color: '#FFFFFF', label: 'Email'    },
  phone:    { Icon: LuPhone,      color: '#FFFFFF', label: 'Phone'    },
  telegram: { Icon: SiTelegram,   color: '#26A5E4', label: 'Telegram' },
  x:        { Icon: SiX,          color: '#FFFFFF', label: 'X'        },
  linkedin: { Icon: FaLinkedin,   color: '#0A66C2', label: 'LinkedIn' },
  website:  { Icon: LuGlobe,      color: '#FFFFFF', label: 'Website'  },
  whatsapp: { Icon: SiWhatsapp,   color: '#25D366', label: 'WhatsApp' },
  wechat:   { Icon: SiWechat,     color: '#07C160', label: 'WeChat'   },
  line:     { Icon: SiLine,       color: '#06C755', label: 'Line'     },
};

export function ChannelIcon({ kind, size = 18 }: { kind: ChannelKind; size?: number }) {
  const { Icon, color } = CHANNEL_ICONS[kind];
  return <Icon size={size} color={color} />;
}
