import { Grid, Header, MinimizedPanelsMenu, MinimizedPanelsMenuContextProvider, Panel, usePanelManager } from '@6njp/prototype-library'
import { getThemeVariables } from '@6njp/prototype-library/machinery'

import { ControlsOverview } from '@/pages/ControlsOverview/ControlsOverview.jsx'
import { DesignOverview } from '@/pages/DesignOverview/DesignOverview.jsx'
import { TimelineOverview } from '@/pages/TimelineOverview/TimelineOverview.jsx'

import styles from './App.module.css'

export default function App() {
  const [isDark, setIsDark] = React.useState(true)
  const themeName = isDark ? 'dark' : 'light'
  const themeVariables = getThemeVariables(themeName)

  return (
    <MinimizedPanelsMenuContextProvider>
      <main style={themeVariables} className={styles.app}>
        <Header onToggleTheme={() => setIsDark(d => !d)} layoutClassName={styles.headerLayout} {...{ isDark }} />

        <Grid layoutClassName={styles.gridLayout}>
          <AppPanels />
        </Grid>

        <MinimizedPanelsMenu layoutClassName={styles.minimizedMenuLayout} />
      </main>
    </MinimizedPanelsMenuContextProvider>
  )
}

function AppPanels() {
  const design   = usePanelManager('design',    'Design')
  const controls = usePanelManager('controls',  'Controls')
  const timeline = usePanelManager('timeline', 'Timeline')

  return (
    <>
      {design.visible && (
        <Panel
          isMinimizable
          title='Design'
          minWidth={8}
          minHeight={8}
          onMinimize={design.minimize}
        >
          <DesignOverview />
        </Panel>
      )}

      {controls.visible && (
        <Panel
          isMinimizable
          title='Controls'
          minWidth={8}
          minHeight={8}
          onMinimize={controls.minimize}
        >
          <ControlsOverview />
        </Panel>
      )}

      {timeline.visible && (
        <Panel
          isMinimizable
          title='Timeline'
          minWidth={8}
          minHeight={8}
          onMinimize={timeline.minimize}
        >
          <TimelineOverview />
        </Panel>
      )}
    </>
  )
}
