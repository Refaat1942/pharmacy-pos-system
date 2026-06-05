import { useTranslation } from 'react-i18next'

type Props = {
  variant?: 'full' | 'short'
  className?: string
}

export default function CopyrightNotice({ variant = 'full', className = '' }: Props) {
  const { t } = useTranslation()
  const text = variant === 'short' ? t('copyright_short') : t('copyright')
  return <p className={className}>{text}</p>
}
