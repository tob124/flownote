import DreamControls from '../components/DreamControls'
import DreamReportList from '../components/DreamReportList'
import MarkdownViewer from '../components/MarkdownViewer'
import { useDream } from '../context/DreamContext'

export default function DreamPage(): JSX.Element {
  const { currentContent } = useDream()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <DreamControls />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <DreamReportList />
        <MarkdownViewer content={currentContent} />
      </div>
    </div>
  )
}
