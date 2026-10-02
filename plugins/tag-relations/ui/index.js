import { registerPlugin, registerRoute, PluginApi } from 'stash-plugin-api';
import RelatedTagsPanel from './components/RelatedTagsPanel';
import TagRelationsPage from './components/TagRelationsPage';
import './styles.css';

function plugin(pluginApi: PluginApi) {
  registerRoute('/tag-relations', TagRelationsPage);

  pluginApi.ui.patch('TagPage', (OriginalComponent) => {
    return function PatchedTagPage(props) {
      return (
        <>
          <OriginalComponent {...props} />
          <RelatedTagsPanel tagId={props.match?.params?.id} />
        </>
      );
    };
  });
}

registerPlugin(plugin);