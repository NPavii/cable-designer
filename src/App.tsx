import Home from './pages/Home'
import TemplateEditorWindow from './components/TemplateEditorWindow'

export default function App() {
  const isTemplateEditor = new URLSearchParams(window.location.search).get('templateEditor') === '1'
  return isTemplateEditor ? <TemplateEditorWindow /> : <Home />
}
