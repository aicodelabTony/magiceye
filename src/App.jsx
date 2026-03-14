import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  closeMiniApp,
  getRuntimeContext,
  openExternalUrl,
  readAppStorage,
  shareText,
  trackClick,
  trackScreen,
  writeAppStorage,
} from './lib/toss.js'

const STORAGE_KEY = 'magiceye-progress-v1'
const DRYNESS_LOG_KEY = 'magiceye-dryness-log-v1'
const REMINDER_SETTINGS_KEY = 'magiceye-reminder-settings-v1'
const FOCUS_SESSION_SECONDS = 90
const PATTERN_ROTATE_SECONDS = 20
const ANSWER_REVEAL_SECONDS = 3
const ASSET_BASE_URL = import.meta.env.BASE_URL

const STEREO_LEVELS = [
  {
    id: 'starter',
    name: '가볍게 봐요',
    detail: '입체감이 부드럽게 떠올라요',
    shift: 6,
    stripWidth: 70,
  },
  {
    id: 'focus',
    name: '집중해요',
    detail: '입체감이 조금 더 또렷해져요',
    shift: 9,
    stripWidth: 76,
  },
  {
    id: 'deep',
    name: '깊게 봐요',
    detail: '입체감이 더 깊게 떠올라요',
    shift: 11,
    stripWidth: 84,
  },
]

const STEREO_PATTERNS = [
  { id: 'cloud', name: '구름을 봐요', answer: '구름', detail: '구름 모양', imageSrc: `${ASSET_BASE_URL}cloud-image.png` },
  { id: 'star', name: '별을 봐요', answer: '별', detail: '별 모양', imageSrc: `${ASSET_BASE_URL}star-image.png` },
  { id: 'sun', name: '태양을 봐요', answer: '태양', detail: '태양 모양', imageSrc: `${ASSET_BASE_URL}sun-image.png` },
  { id: 'arrow', name: '화살표를 봐요', answer: '화살표', detail: '화살표 모양', imageSrc: `${ASSET_BASE_URL}arrow-image.png` },
  { id: 'abc', name: 'ABC를 봐요', answer: 'ABC', detail: '알파벳 ABC', imageSrc: `${ASSET_BASE_URL}abc-image.png` },
  { id: 'ai', name: 'AI를 봐요', answer: 'AI', detail: '알파벳 AI', imageSrc: `${ASSET_BASE_URL}ai-image.png` },
  { id: 'dog', name: 'DOG를 봐요', answer: 'DOG', detail: '알파벳 DOG', imageSrc: `${ASSET_BASE_URL}dog-image.png` },
  { id: 'key', name: 'KEY를 봐요', answer: 'KEY', detail: '알파벳 KEY', imageSrc: `${ASSET_BASE_URL}key-image.png` },
]

const DRYNESS_LEVELS = [
  { id: 'calm', score: 0, label: '편안해요', detail: '지금 눈이 비교적 편안해요.' },
  { id: 'light', score: 1, label: '조금 건조해요', detail: '잠깐 쉬면 금방 편해질 수 있어요.' },
  { id: 'medium', score: 2, label: '꽤 건조해요', detail: '깜빡임과 휴식을 조금 더 챙겨봐요.' },
  { id: 'high', score: 3, label: '많이 뻑뻑해요', detail: '지금은 화면을 잠시 멈추고 쉬어가는 편이 좋아요.' },
]

const DRYNESS_SYMPTOMS = [
  '뻑뻑해요',
  '시려요',
  '눈물이 나요',
  '초점이 흐려요',
]

const MAIN_TABS = [
  { id: 'routine', label: '루틴' },
  { id: 'focus', label: '초점' },
  { id: 'stereo', label: '패턴' },
  { id: 'care', label: '기록' },
  { id: 'settings', label: '설정' },
]

const DEFAULT_REMINDER_TIMES = ['09:00', '14:00', '20:00']

const STEREO_SESSION_SECONDS = PATTERN_ROTATE_SECONDS * STEREO_PATTERNS.length

function getTodayKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyStats() {
  return {
    totalSessions: 0,
    focusSessions: 0,
    stereoSessions: 0,
    totalSeconds: 0,
    lastCompletedOn: '',
  }
}

function createDefaultReminderSettings() {
  return {
    enabled: false,
    times: DEFAULT_REMINDER_TIMES,
  }
}

function parseStoredStats(raw) {
  if (!raw) {
    return createEmptyStats()
  }

  try {
    const parsed = JSON.parse(raw)
    return {
      ...createEmptyStats(),
      ...parsed,
    }
  } catch {
    return createEmptyStats()
  }
}

function parseDrynessRecords(raw) {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => ({
        id: typeof item.id === 'string' ? item.id : `dryness-${index}`,
        levelId: typeof item.levelId === 'string' ? item.levelId : DRYNESS_LEVELS[0].id,
        symptoms: Array.isArray(item.symptoms)
          ? item.symptoms.filter((symptom) => typeof symptom === 'string')
          : [],
        loggedAt: typeof item.loggedAt === 'number' ? item.loggedAt : Date.now(),
      }))
      .slice(0, 20)
  } catch {
    return []
  }
}

function isValidReminderTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

function parseReminderSettings(raw) {
  if (!raw) {
    return createDefaultReminderSettings()
  }

  try {
    const parsed = JSON.parse(raw)
    const reminderTimes = Array.isArray(parsed.times)
      ? DEFAULT_REMINDER_TIMES.map((defaultTime, index) =>
          isValidReminderTime(parsed.times[index]) ? parsed.times[index] : defaultTime,
        )
      : DEFAULT_REMINDER_TIMES

    return {
      enabled: Boolean(parsed.enabled),
      times: reminderTimes,
    }
  } catch {
    return createDefaultReminderSettings()
  }
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds))
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0')
  const seconds = String(safeSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function formatDurationLabel(totalSeconds) {
  if (totalSeconds < 60) {
    return `${totalSeconds}초`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`
}

function formatLoggedAt(timestamp) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function getNotificationPermissionStatus() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported'
  }

  return Notification.permission
}

function getNextReminderDelay(time) {
  const [hours, minutes] = time.split(':').map(Number)
  const now = new Date()
  const next = new Date()
  next.setHours(hours, minutes, 0, 0)

  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }

  return next.getTime() - now.getTime()
}

function getDrynessLevel(levelId) {
  return DRYNESS_LEVELS.find((item) => item.id === levelId) ?? DRYNESS_LEVELS[0]
}

function getDrynessGuidance(record) {
  if (!record) {
    return '눈 상태를 간단히 기록해두면 쉬어갈 타이밍을 더 쉽게 볼 수 있어요.'
  }

  if (record.levelId === 'high') {
    return '지금은 20초 정도 먼 곳을 보고 천천히 10번 깜빡이며 쉬어가요.'
  }

  if (record.levelId === 'medium') {
    return '눈을 조금 쉬게 하고 화면 밝기와 거리도 같이 확인해봐요.'
  }

  if (record.levelId === 'light') {
    return '짧게 눈을 감았다가 다시 시작하면 더 편하게 이어갈 수 있어요.'
  }

  return '지금처럼 편안한 상태를 유지할 수 있게 짧은 휴식을 이어가요.'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function smoothStep(value, start, end) {
  const normalized = clamp((value - start) / (end - start), 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function getFocusMotion(elapsedSeconds, tick) {
  const progress = elapsedSeconds / FOCUS_SESSION_SECONDS
  const phase = tick / 1000
  const horizontalWeight = 1 - smoothStep(progress, 0.28, 0.42)
  const verticalWeight = smoothStep(progress, 0.22, 0.38) * (1 - smoothStep(progress, 0.58, 0.74))
  const orbitWeight = smoothStep(progress, 0.56, 0.74)

  const totalWeight = horizontalWeight + verticalWeight + orbitWeight || 1
  const normalizedHorizontal = horizontalWeight / totalWeight
  const normalizedVertical = verticalWeight / totalWeight
  const normalizedOrbit = orbitWeight / totalWeight

  const horizontalX = Math.sin(phase * 2.1) * 108
  const verticalY = Math.sin(phase * 2.05) * 108
  const orbitX = Math.sin(phase * 1.45) * 88
  const orbitY = Math.cos(phase * 1.85) * 70

  const x = horizontalX * normalizedHorizontal + orbitX * normalizedOrbit
  const y = verticalY * normalizedVertical + orbitY * normalizedOrbit
  const scale = 0.96
    + Math.abs(Math.sin(phase * 2.7)) * 0.18
    + normalizedOrbit * 0.14

  let label = '처음에는 좌우 움직임부터 천천히 따라가요.'
  if (normalizedVertical > normalizedHorizontal && normalizedVertical >= normalizedOrbit) {
    label = '이제 위아래 움직임으로 자연스럽게 이어가요.'
  }
  if (normalizedOrbit > normalizedVertical && normalizedOrbit > normalizedHorizontal) {
    label = '마지막에는 원을 그리듯 부드럽게 따라가요.'
  }

  return {
    x,
    y,
    scale,
    label,
  }
}

function StatCard({ label, value, tone = 'default' }) {
  return (
    <article className={`stat-card ${tone === 'accent' ? 'stat-card-accent' : ''}`}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function ExerciseCard({ title, description, meta, accent, buttonLabel, onStart }) {
  return (
    <article className={`exercise-card exercise-card-${accent}`}>
      <div className="exercise-copy">
        <p className="eyebrow">{meta}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button className="button" type="button" onClick={onStart}>
        {buttonLabel}
      </button>
    </article>
  )
}

function TabIcon({ tabId, active }) {
  const stroke = active ? 'currentColor' : 'currentColor'
  const commonProps = {
    fill: 'none',
    stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '1.8',
  }

  if (tabId === 'routine') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="4" {...commonProps} />
        <path d="M8 10h8M8 14h5" {...commonProps} />
      </svg>
    )
  }

  if (tabId === 'focus') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16M4 12h16" {...commonProps} />
        <circle cx="12" cy="12" r="3.5" {...commonProps} />
      </svg>
    )
  }

  if (tabId === 'stereo') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="12" r="3" {...commonProps} />
        <circle cx="16" cy="12" r="3" {...commonProps} />
        <path d="M5 17c1.5-1 3-1.5 7-1.5S17.5 16 19 17" {...commonProps} />
      </svg>
    )
  }

  if (tabId === 'care') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s-6-3.8-6-9a3.5 3.5 0 0 1 6-2.2A3.5 3.5 0 0 1 18 11c0 5.2-6 9-6 9Z" {...commonProps} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v3M12 17.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1" {...commonProps} />
      <circle cx="12" cy="12" r="3.2" {...commonProps} />
    </svg>
  )
}

function BottomTabBar({ activeTab, onChange }) {
  return (
    <nav className="bottom-tab-bar" aria-label="기능 메뉴">
      {MAIN_TABS.map((tab) => {
        const active = tab.id === activeTab
        return (
          <button
            key={tab.id}
            className={`bottom-tab-button ${active ? 'bottom-tab-button-active' : ''}`}
            type="button"
            onClick={() => onChange(tab.id)}
          >
            <span className="bottom-tab-icon">
              <TabIcon tabId={tab.id} active={active} />
            </span>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function RoutineTab({ stats, lastSession, runtimeContext }) {
  const todayDone = stats.lastCompletedOn === getTodayKey()
  const brandDisplayName = runtimeContext.globals?.brandDisplayName

  return (
    <>
      <section className="hero-card">
        <p className="eyebrow eyebrow-light">매일 짧게 이어가요</p>
        <h1>매일 짧게 눈을 풀어요</h1>
        <p className="hero-copy">
          초점 이동 운동과 매직아이 훈련을 한 흐름으로 이어서 할 수 있게
          루틴으로 묶었어요.
        </p>
        <div className="hero-tags">
          <span>{todayDone ? '오늘도 루틴을 했어요' : '오늘 루틴을 시작해봐요'}</span>
          <span>{stats.totalSessions}번 이어왔어요</span>
          {runtimeContext.isTossApp ? <span>{`${brandDisplayName ?? '토스'}에서 이어가요`}</span> : null}
        </div>
      </section>

      <section className="stat-grid" aria-label="누적 통계">
        <StatCard label="지금까지 했어요" value={`${stats.totalSessions}회`} tone="accent" />
        <StatCard label="이만큼 이어왔어요" value={formatDurationLabel(stats.totalSeconds)} />
        <StatCard label="초점 운동 했어요" value={`${stats.focusSessions}회`} />
        <StatCard label="매직아이 했어요" value={`${stats.stereoSessions}회`} />
      </section>

      {lastSession ? (
        <section className="completion-card" aria-live="polite">
          <p className="eyebrow">방금 이렇게 했어요</p>
          <strong>
            {lastSession.type === 'focus' ? '초점 이동 운동' : '매직아이 훈련'}을
            {` ${formatDurationLabel(lastSession.seconds)} 동안 했어요.`}
          </strong>
        </section>
      ) : null}

      <section className="routine-card">
        <div className="section-heading">
          <h2>오늘은 이렇게 해요</h2>
          <p>가볍게 두 단계로 이어가면 돼요.</p>
        </div>
        <div className="routine-steps">
          <div className="routine-step">
            <span>1</span>
            <div>
              <strong>초점 이동 운동 {formatDurationLabel(FOCUS_SESSION_SECONDS)}</strong>
              <p>좌우에서 상하, 원형 흐름으로 자연스럽게 이어가며 눈의 긴장을 풀어요.</p>
            </div>
          </div>
          <div className="routine-step">
            <span>2</span>
            <div>
              <strong>매직아이 훈련 {formatDurationLabel(STEREO_SESSION_SECONDS)}</strong>
              <p>패턴 10개를 20초마다 하나씩 보며 시선을 멀리 두는 감각을 익혀봐요.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function FocusTab({ onStart }) {
  return (
    <>
      <section className="panel-card">
        <div className="section-heading">
          <h2>초점 운동을 이어가요</h2>
          <p>좌우에서 상하, 원형 움직임까지 부드럽게 이어가며 1분 30초 동안 집중해요.</p>
        </div>
      </section>
      <section className="exercise-grid" aria-label="초점 운동">
        <ExerciseCard
          title="초점 이동 운동을 해요"
          description="움직이는 점을 따라가며 좌우, 상하, 원형 흐름을 끊기지 않게 이어가요."
          meta={`${formatDurationLabel(FOCUS_SESSION_SECONDS)} 동안 해요`}
          accent="focus"
          buttonLabel="시작해요"
          onStart={onStart}
        />
      </section>
      <section className="tip-card">
        <p className="eyebrow">이렇게 해봐요</p>
        <p>고개는 편하게 두고 시선만 따라가요. 움직임이 바뀌어도 눈에 힘을 주지 말고 자연스럽게 이어가요.</p>
      </section>
    </>
  )
}

function StereoTab({ level, onStart }) {
  return (
    <>
      <section className="panel-card">
        <div className="section-heading">
          <h2>매직아이 패턴을 봐요</h2>
          <p>20초마다 바뀌는 패턴 10개를 순서대로 이어가며 눈의 초점을 천천히 풀어봐요.</p>
        </div>
      </section>
      <section className="exercise-grid" aria-label="매직아이 훈련">
        <ExerciseCard
          title="매직아이 패턴을 봐요"
          description="패턴 10개를 20초마다 하나씩 보며 시선을 멀리 두는 감각을 익혀봐요."
          meta={`${formatDurationLabel(STEREO_SESSION_SECONDS)} 동안 봐요`}
          accent="stereo"
          buttonLabel="열어봐요"
          onStart={onStart}
        />
      </section>
      <section className="tip-card">
        <p className="eyebrow">지금 난이도예요</p>
        <p>{level.detail} 시선을 화면보다 조금 멀리 두고, 힘을 빼며 천천히 떠오르는 모양을 찾아봐요.</p>
      </section>
    </>
  )
}

function SettingsTab({ runtimeContext, onShare, onOpenGuide, onCloseMiniApp }) {
  const brandDisplayName = runtimeContext.globals?.brandDisplayName ?? '토스'

  return (
    <>
      <section className="panel-card">
        <div className="section-heading">
          <h2>설정을 확인해요</h2>
          <p>앱 안내를 열거나 루틴을 공유하고, 토스 안에서는 미니앱도 바로 닫을 수 있어요.</p>
        </div>
      </section>
      <section className="settings-grid">
        <button className="settings-action-card" type="button" onClick={onShare}>
          <strong>루틴을 공유해요</strong>
          <p>지금 보고 있는 눈운동 루틴을 다른 사람에게 전해요.</p>
        </button>
        <button className="settings-action-card" type="button" onClick={onOpenGuide}>
          <strong>가이드를 열어요</strong>
          <p>토스 앱 연동 가이드와 개발 문서를 확인해요.</p>
        </button>
        {runtimeContext.isTossApp ? (
          <button className="settings-action-card" type="button" onClick={onCloseMiniApp}>
            <strong>미니앱을 닫아요</strong>
            <p>{brandDisplayName} 안에서 보고 있다면 지금 화면을 바로 닫아요.</p>
          </button>
        ) : null}
      </section>
      <section className="tip-card">
        <p className="eyebrow">실행 환경</p>
        <p>{runtimeContext.isTossApp ? `${brandDisplayName} 안에서 실행하고 있어요.` : '지금은 일반 웹에서 미리 보고 있어요.'}</p>
      </section>
    </>
  )
}

function ReminderSettingsCard({
  notificationPermission,
  reminderSettings,
  onChangeTime,
  onRequestPermission,
  onToggleEnabled,
}) {
  let permissionLabel = '브라우저 알림을 함께 켜면 앱을 보고 있지 않을 때도 알림을 받을 수 있어요.'
  if (notificationPermission === 'granted') {
    permissionLabel = '브라우저 알림을 함께 보내고 있어요.'
  }
  if (notificationPermission === 'denied') {
    permissionLabel = '브라우저 알림 권한을 다시 켜면 화면 밖에서도 알림을 받을 수 있어요.'
  }
  if (notificationPermission === 'unsupported') {
    permissionLabel = '이 환경에서는 앱을 열어둘 때 화면 안 알림으로 이어갈 수 있어요.'
  }

  return (
    <section className="panel-card reminder-card">
      <div className="section-heading">
        <h2>하루 3번 알림을 맞춰요</h2>
        <p>원하는 시간을 정해두면 눈을 쉬어갈 타이밍을 하루 세 번 챙길 수 있어요.</p>
      </div>

      <div className="reminder-toggle-row">
        <div>
          <strong>알림을 켜요</strong>
          <p>{permissionLabel}</p>
        </div>
        <button
          className={`toggle-chip ${reminderSettings.enabled ? 'toggle-chip-active' : ''}`}
          type="button"
          onClick={onToggleEnabled}
        >
          {reminderSettings.enabled ? '켜져 있어요' : '켜볼게요'}
        </button>
      </div>

      <div className="reminder-time-grid">
        {reminderSettings.times.map((time, index) => (
          <label key={`${time}-${index}`} className="reminder-time-field">
            <span>{`${index + 1}번째 시간이에요`}</span>
            <input type="time" value={time} onChange={(event) => onChangeTime(index, event.target.value)} />
          </label>
        ))}
      </div>

      {notificationPermission !== 'unsupported' ? (
        <button className="button button-secondary" type="button" onClick={onRequestPermission}>
          브라우저 알림 권한을 켜요
        </button>
      ) : null}

      <article className="tip-card reminder-tip-card">
        <p className="eyebrow">알림 방식이에요</p>
        <p>브라우저 알림 권한을 켜면 시스템 알림으로 받을 수 있고, 앱을 열어두면 화면 안 알림도 함께 볼 수 있어요.</p>
      </article>
    </section>
  )
}

function DrynessCareCard({
  selectedLevelId,
  selectedSymptoms,
  latestRecord,
  onSelectLevel,
  onToggleSymptom,
  onSave,
}) {
  const latestLevel = latestRecord ? getDrynessLevel(latestRecord.levelId) : null

  return (
    <section className="dryness-card">
      <div className="section-heading">
        <h2>건조감을 기록해요</h2>
        <p>지금 느끼는 눈 상태를 짧게 남기고 쉬어갈 타이밍을 확인해봐요.</p>
      </div>

      <div className="dryness-level-grid" aria-label="건조감 정도 선택">
        {DRYNESS_LEVELS.map((item) => (
          <button
            key={item.id}
            className={`dryness-level-button ${selectedLevelId === item.id ? 'dryness-level-button-active' : ''}`}
            type="button"
            onClick={() => onSelectLevel(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>

      <div className="dryness-symptom-group">
        <p className="eyebrow">함께 느껴지는 증상을 골라요</p>
        <div className="dryness-symptom-grid">
          {DRYNESS_SYMPTOMS.map((symptom) => {
            const active = selectedSymptoms.includes(symptom)
            return (
              <button
                key={symptom}
                className={`dryness-chip ${active ? 'dryness-chip-active' : ''}`}
                type="button"
                onClick={() => onToggleSymptom(symptom)}
              >
                {symptom}
              </button>
            )
          })}
        </div>
      </div>

      <button className="button" type="button" onClick={onSave}>
        지금 상태를 기록해요
      </button>

      <article className="dryness-latest-card" aria-live="polite">
        <p className="eyebrow">최근 기록</p>
        {latestRecord ? (
          <>
            <strong>{latestLevel?.label}</strong>
            <p>
              {formatLoggedAt(latestRecord.loggedAt)}
              {latestRecord.symptoms.length > 0
                ? ` · ${latestRecord.symptoms.join(', ')}`
                : ' · 증상은 따로 남기지 않았어요.'}
            </p>
          </>
        ) : (
          <>
            <strong>아직 기록이 없어요</strong>
            <p>처음 한 번만 기록해두면 오늘 눈 상태를 이어서 보기 쉬워져요.</p>
          </>
        )}
      </article>

      <article className="tip-card dryness-guide-card">
        <p className="eyebrow">지금 이렇게 해봐요</p>
        <p>{getDrynessGuidance(latestRecord)}</p>
      </article>
    </section>
  )
}

function HomeScreen({
  activeTab,
  stats,
  drynessLevelId,
  drynessSymptoms,
  drynessRecords,
  lastSession,
  notificationPermission,
  reminderSettings,
  runtimeContext,
  stereoLevel,
  onShare,
  onOpenGuide,
  onCloseMiniApp,
  onChangeTab,
  onChangeReminderTime,
  onRequestNotificationPermission,
  onSaveDrynessRecord,
  onSelectDrynessLevel,
  onStartFocus,
  onStartStereo,
  onToggleReminderEnabled,
  onToggleDrynessSymptom,
}) {
  const latestDrynessRecord = drynessRecords[0] ?? null

  let content = <RoutineTab stats={stats} lastSession={lastSession} runtimeContext={runtimeContext} />

  if (activeTab === 'focus') {
    content = <FocusTab onStart={onStartFocus} />
  }

  if (activeTab === 'stereo') {
    content = <StereoTab level={stereoLevel} onStart={onStartStereo} />
  }

  if (activeTab === 'care') {
    content = (
      <DrynessCareCard
        selectedLevelId={drynessLevelId}
        selectedSymptoms={drynessSymptoms}
        latestRecord={latestDrynessRecord}
        onSelectLevel={onSelectDrynessLevel}
        onToggleSymptom={onToggleDrynessSymptom}
        onSave={onSaveDrynessRecord}
      />
    )
  }

  if (activeTab === 'settings') {
    content = (
      <>
        <ReminderSettingsCard
          notificationPermission={notificationPermission}
          reminderSettings={reminderSettings}
          onChangeTime={onChangeReminderTime}
          onRequestPermission={onRequestNotificationPermission}
          onToggleEnabled={onToggleReminderEnabled}
        />
        <SettingsTab
          runtimeContext={runtimeContext}
          onShare={onShare}
          onOpenGuide={onOpenGuide}
          onCloseMiniApp={onCloseMiniApp}
        />
      </>
    )
  }

  return (
    <main className="screen screen-main">
      <div className="screen-scroll-content">{content}</div>
      <BottomTabBar activeTab={activeTab} onChange={onChangeTab} />
    </main>
  )
}

function FocusScreen({ elapsed, tick, onExit }) {
  const motion = getFocusMotion(elapsed, tick)
  const progress = Math.min(100, (elapsed / FOCUS_SESSION_SECONDS) * 100)

  return (
    <main className="screen screen-session">
      <header className="session-header">
        <div>
          <p className="eyebrow">초점 루틴을 해요</p>
          <h1>초점 이동 운동을 해요</h1>
        </div>
        <button className="ghost-button" type="button" onClick={onExit}>
          그만해요
        </button>
      </header>

      <section className="session-panel">
        <div className="session-status">
          <strong>{formatClock(FOCUS_SESSION_SECONDS - elapsed)}</strong>
          <span>{Math.min(FOCUS_SESSION_SECONDS, Math.floor(elapsed))} / {FOCUS_SESSION_SECONDS}초</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="session-copy">{motion.label}</p>

        <div className="focus-stage">
          <div className="focus-grid" aria-hidden="true">
            <span className="focus-line-horizontal" />
            <span className="focus-line-vertical" />
            <span className="focus-center-ring" />
          </div>
          <div
            className="focus-dot"
            style={{
              transform: `translate(${motion.x}px, ${motion.y}px) scale(${motion.scale})`,
            }}
          />
        </div>
      </section>

      <section className="tip-card">
        <p className="eyebrow">이렇게 해봐요</p>
        <p>고개는 편하게 두고 시선만 부드럽게 따라가요. 눈이 뻐근하면 바로 쉬어가도 돼요.</p>
      </section>
    </main>
  )
}

function StereoScreen({
  elapsed,
  level,
  pattern,
  onRefreshPattern,
  onExit,
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const progress = Math.min(100, (elapsed / STEREO_SESSION_SECONDS) * 100)
  const patternIndex = STEREO_PATTERNS.findIndex((item) => item.id === pattern.id)
  const currentStep = patternIndex + 1
  const rotationElapsed = elapsed % PATTERN_ROTATE_SECONDS
  const secondsUntilNext = Math.max(1, Math.ceil(PATTERN_ROTATE_SECONDS - rotationElapsed))
  const isLastPattern = currentStep === STEREO_PATTERNS.length
  const shouldRevealAnswer = secondsUntilNext <= ANSWER_REVEAL_SECONDS

  useEffect(() => {
    setIsExpanded(false)
  }, [pattern.id])

  return (
    <main className="screen screen-session">
      <header className="session-header">
        <div>
          <p className="eyebrow">매직아이 패턴을 봐요</p>
          <h1>매직아이 패턴을 봐요</h1>
        </div>
        <button className="ghost-button" type="button" onClick={onExit}>
          그만해요
        </button>
      </header>

      <section className="session-panel">
        <div className="session-status">
          <strong>{formatClock(STEREO_SESSION_SECONDS - elapsed)}</strong>
          <span>{Math.min(STEREO_SESSION_SECONDS, Math.floor(elapsed))} / {STEREO_SESSION_SECONDS}초</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <button
          className={`stereo-frame-button ${isExpanded ? 'stereo-frame-button-expanded' : ''}`}
          type="button"
          onClick={() => setIsExpanded((previous) => !previous)}
        >
          <div className={`stereo-frame ${isExpanded ? 'stereo-frame-expanded' : ''}`}>
            <img className="stereo-canvas" src={pattern.imageSrc} alt={pattern.name} />
            {shouldRevealAnswer ? (
              <div className="stereo-answer-badge" aria-live="polite">
                정답: {pattern.answer}
              </div>
            ) : null}
          </div>
        </button>

        <div className="pattern-rotation-card" aria-live="polite">
          <div className="pattern-rotation-head">
            <div>
              <p className="eyebrow">{shouldRevealAnswer ? '정답을 확인해요' : '지금은 정답을 기다려요'}</p>
              <strong>{shouldRevealAnswer ? `${pattern.answer}예요` : '이미지에 집중해요'}</strong>
            </div>
            <span>{currentStep} / {STEREO_PATTERNS.length}</span>
          </div>
          <div className="pattern-rotation-track" aria-hidden="true">
            <div
              className="pattern-rotation-fill"
              style={{ width: `${(currentStep / STEREO_PATTERNS.length) * 100}%` }}
            />
          </div>
          <p className="pattern-rotation-copy">
            {shouldRevealAnswer
              ? (isLastPattern
                  ? `${secondsUntilNext}초 뒤에 루틴을 마무리해요.`
                  : `${secondsUntilNext}초 뒤에 다음 패턴으로 넘어가요.`)
              : `${secondsUntilNext}초 뒤에 정답이 보여요.`}
          </p>
        </div>
      </section>

      <section className="tip-stack">
        <article className="tip-card">
          <p className="eyebrow">이렇게 해봐요</p>
          <p>눈에 힘을 조금 풀고 화면 뒤쪽을 본다는 느낌으로 2초 정도 유지해봐요.</p>
        </article>
        <button className="button button-secondary" type="button" onClick={onRefreshPattern}>
          패턴 다시 만들어요
        </button>
      </section>
    </main>
  )
}

function App() {
  const [screen, setScreen] = useState('home')
  const [activeTab, setActiveTab] = useState('routine')
  const [focusElapsed, setFocusElapsed] = useState(0)
  const [focusTick, setFocusTick] = useState(0)
  const [stereoElapsed, setStereoElapsed] = useState(0)
  const [stereoPatternOffset, setStereoPatternOffset] = useState(0)
  const [stats, setStats] = useState(() => createEmptyStats())
  const [drynessRecords, setDrynessRecords] = useState([])
  const [reminderSettings, setReminderSettings] = useState(() => createDefaultReminderSettings())
  const [selectedDrynessLevelId, setSelectedDrynessLevelId] = useState(DRYNESS_LEVELS[0].id)
  const [selectedDrynessSymptoms, setSelectedDrynessSymptoms] = useState([])
  const [hasHydratedStats, setHasHydratedStats] = useState(false)
  const [lastSession, setLastSession] = useState(null)
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermissionStatus())
  const [reminderToast, setReminderToast] = useState(null)
  const reminderTimeoutsRef = useRef([])
  const [runtimeContext] = useState(() => getRuntimeContext())

  const stereoLevel = STEREO_LEVELS[0]
  const stereoPatternIndex =
    (Math.floor(stereoElapsed / PATTERN_ROTATE_SECONDS) + stereoPatternOffset) % STEREO_PATTERNS.length
  const stereoPattern = STEREO_PATTERNS[stereoPatternIndex]

  useEffect(() => {
    let cancelled = false

    async function hydrateStats() {
      const [rawStats, rawDryness, rawReminder] = await Promise.all([
        readAppStorage(STORAGE_KEY),
        readAppStorage(DRYNESS_LOG_KEY),
        readAppStorage(REMINDER_SETTINGS_KEY),
      ])
      if (cancelled) {
        return
      }

      setStats(parseStoredStats(rawStats))
      setDrynessRecords(parseDrynessRecords(rawDryness))
      setReminderSettings(parseReminderSettings(rawReminder))
      setNotificationPermission(getNotificationPermissionStatus())
      setHasHydratedStats(true)
    }

    hydrateStats()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedStats) {
      return
    }

    writeAppStorage(STORAGE_KEY, JSON.stringify(stats))
  }, [hasHydratedStats, stats])

  useEffect(() => {
    if (!hasHydratedStats) {
      return
    }

    writeAppStorage(DRYNESS_LOG_KEY, JSON.stringify(drynessRecords))
  }, [drynessRecords, hasHydratedStats])

  useEffect(() => {
    if (!hasHydratedStats) {
      return
    }

    writeAppStorage(REMINDER_SETTINGS_KEY, JSON.stringify(reminderSettings))
  }, [hasHydratedStats, reminderSettings])

  useEffect(() => {
    trackScreen(`magiceye_${screen}_screen`, {
      screen_name: screen,
      active_tab: activeTab,
      is_toss_app: runtimeContext.isTossApp,
      selected_level: stereoLevel.id,
      selected_pattern: stereoPattern.id,
    })
  }, [activeTab, runtimeContext.isTossApp, screen, stereoLevel.id, stereoPattern.id])

  const completeSession = useEffectEvent((type, seconds) => {
    setStats((previous) => ({
      ...previous,
      totalSessions: previous.totalSessions + 1,
      focusSessions: previous.focusSessions + (type === 'focus' ? 1 : 0),
      stereoSessions: previous.stereoSessions + (type === 'stereo' ? 1 : 0),
      totalSeconds: previous.totalSeconds + seconds,
      lastCompletedOn: getTodayKey(),
    }))

    setLastSession({ type, seconds, finishedAt: Date.now() })
    setScreen('home')
  })

  const pushReminder = useEffectEvent((time) => {
    const message = `${time} 알림이에요. 눈을 잠깐 쉬고 먼 곳을 20초 정도 바라봐요.`

    setReminderToast({
      id: `${Date.now()}`,
      title: '눈을 쉬어갈 시간이 왔어요',
      message,
    })

    if (notificationPermission === 'granted' && typeof Notification !== 'undefined') {
      new Notification('눈을 쉬어갈 시간이 왔어요', {
        body: message,
        tag: `magiceye-reminder-${time}`,
      })
    }
  })

  useEffect(() => {
    if (!reminderToast) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setReminderToast(null)
    }, 7000)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [reminderToast])

  useEffect(() => {
    reminderTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    reminderTimeoutsRef.current = []

    if (!hasHydratedStats || !reminderSettings.enabled) {
      return undefined
    }

    function scheduleReminder(time) {
      const delay = getNextReminderDelay(time)
      const timerId = window.setTimeout(() => {
        pushReminder(time)
        scheduleReminder(time)
      }, delay)

      reminderTimeoutsRef.current.push(timerId)
    }

    reminderSettings.times.forEach((time) => {
      if (isValidReminderTime(time)) {
        scheduleReminder(time)
      }
    })

    return () => {
      reminderTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId))
      reminderTimeoutsRef.current = []
    }
  }, [hasHydratedStats, reminderSettings])

  useEffect(() => {
    if (screen !== 'focus') {
      return undefined
    }

    let frameId = 0
    const startedAt = performance.now()

    const updateFrame = (now) => {
      const elapsedSeconds = Math.min((now - startedAt) / 1000, FOCUS_SESSION_SECONDS)
      setFocusElapsed(elapsedSeconds)
      setFocusTick(now - startedAt)

      if (elapsedSeconds >= FOCUS_SESSION_SECONDS) {
        completeSession('focus', FOCUS_SESSION_SECONDS)
        return
      }

      frameId = requestAnimationFrame(updateFrame)
    }

    frameId = requestAnimationFrame(updateFrame)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [screen])

  useEffect(() => {
    if (screen !== 'stereo') {
      return undefined
    }

    let frameId = 0
    const startedAt = performance.now()

    const updateFrame = (now) => {
      const elapsedSeconds = Math.min((now - startedAt) / 1000, STEREO_SESSION_SECONDS)
      setStereoElapsed(elapsedSeconds)

      if (elapsedSeconds >= STEREO_SESSION_SECONDS) {
        completeSession('stereo', STEREO_SESSION_SECONDS)
        return
      }

      frameId = requestAnimationFrame(updateFrame)
    }

    frameId = requestAnimationFrame(updateFrame)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [screen])

  function handleStartFocus() {
    trackClick('magiceye_start_focus_click', {
      screen_name: screen,
      active_tab: activeTab,
    })
    setFocusElapsed(0)
    setFocusTick(0)
    setScreen('focus')
  }

  function handleStartStereo() {
    trackClick('magiceye_start_stereo_click', {
      screen_name: screen,
      active_tab: activeTab,
      selected_pattern: stereoPattern.id,
    })
    setStereoElapsed(0)
    setStereoPatternOffset(0)
    setScreen('stereo')
  }

  function handleExitSession() {
    trackClick('magiceye_exit_session_click', {
      screen_name: screen,
      active_tab: activeTab,
    })
    setScreen('home')
  }

  function handleRefreshPattern() {
    trackClick('magiceye_refresh_pattern_click', {
      selected_level: stereoLevel.id,
      selected_pattern: stereoPattern.id,
    })
    setStereoPatternOffset((previous) => (previous + 1) % STEREO_PATTERNS.length)
  }

  function handleSelectDrynessLevel(levelId) {
    trackClick('magiceye_select_dryness_level_click', {
      level_id: levelId,
    })
    setSelectedDrynessLevelId(levelId)
  }

  function handleToggleDrynessSymptom(symptom) {
    trackClick('magiceye_toggle_dryness_symptom_click', {
      symptom_name: symptom,
    })
    setSelectedDrynessSymptoms((previous) =>
      previous.includes(symptom)
        ? previous.filter((item) => item !== symptom)
        : [...previous, symptom],
    )
  }

  function handleSaveDrynessRecord() {
    trackClick('magiceye_save_dryness_record_click', {
      level_id: selectedDrynessLevelId,
      symptom_count: selectedDrynessSymptoms.length,
    })

    const nextRecord = {
      id: `${Date.now()}`,
      levelId: selectedDrynessLevelId,
      symptoms: selectedDrynessSymptoms,
      loggedAt: Date.now(),
    }

    setDrynessRecords((previous) => [nextRecord, ...previous].slice(0, 20))
    setSelectedDrynessSymptoms([])
  }

  function handleToggleReminderEnabled() {
    trackClick('magiceye_toggle_reminder_click', {
      enabled: !reminderSettings.enabled,
    })
    setReminderSettings((previous) => ({
      ...previous,
      enabled: !previous.enabled,
    }))
  }

  function handleChangeReminderTime(index, value) {
    if (!isValidReminderTime(value)) {
      return
    }

    trackClick('magiceye_change_reminder_time_click', {
      reminder_index: index,
      time_value: value,
    })

    setReminderSettings((previous) => ({
      ...previous,
      times: previous.times.map((time, timeIndex) => (timeIndex === index ? value : time)),
    }))
  }

  async function handleRequestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    trackClick('magiceye_request_notification_permission_click', {
      permission,
    })
  }

  function handleChangeTab(tabId) {
    trackClick('magiceye_change_tab_click', {
      previous_tab: activeTab,
      next_tab: tabId,
    })
    setActiveTab(tabId)
  }

  async function handleShareRoutine() {
    trackClick('magiceye_share_routine_click', {
      screen_name: screen,
    })

    await shareText('매직아이 루틴으로 짧게 눈을 풀어봐요.\nintoss://magiceye')
  }

  async function handleOpenGuide() {
    trackClick('magiceye_open_guide_click', {
      screen_name: screen,
    })

    await openExternalUrl('https://developers-apps-in-toss.toss.im')
  }

  async function handleCloseMiniApp() {
    trackClick('magiceye_close_miniapp_click', {
      screen_name: screen,
    })

    await closeMiniApp()
  }

  return (
    <div className="app-shell">
      {reminderToast ? (
        <div className="reminder-toast" role="status" aria-live="polite">
          <strong>{reminderToast.title}</strong>
          <p>{reminderToast.message}</p>
        </div>
      ) : null}

      {screen === 'home' ? (
        <HomeScreen
          activeTab={activeTab}
          stats={stats}
          drynessLevelId={selectedDrynessLevelId}
          drynessSymptoms={selectedDrynessSymptoms}
          drynessRecords={drynessRecords}
          lastSession={lastSession}
          notificationPermission={notificationPermission}
          reminderSettings={reminderSettings}
          runtimeContext={runtimeContext}
          stereoLevel={stereoLevel}
          onShare={handleShareRoutine}
          onOpenGuide={handleOpenGuide}
          onCloseMiniApp={handleCloseMiniApp}
          onChangeTab={handleChangeTab}
          onChangeReminderTime={handleChangeReminderTime}
          onRequestNotificationPermission={handleRequestNotificationPermission}
          onSaveDrynessRecord={handleSaveDrynessRecord}
          onSelectDrynessLevel={handleSelectDrynessLevel}
          onStartFocus={handleStartFocus}
          onStartStereo={handleStartStereo}
          onToggleReminderEnabled={handleToggleReminderEnabled}
          onToggleDrynessSymptom={handleToggleDrynessSymptom}
        />
      ) : null}

      {screen === 'focus' ? (
        <FocusScreen elapsed={focusElapsed} tick={focusTick} onExit={handleExitSession} />
      ) : null}

      {screen === 'stereo' ? (
        <StereoScreen
          elapsed={stereoElapsed}
          level={stereoLevel}
          pattern={stereoPattern}
          onRefreshPattern={handleRefreshPattern}
          onExit={handleExitSession}
        />
      ) : null}
    </div>
  )
}

export default App
