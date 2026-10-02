const React = window.PluginApi.React;
import TagRelationsPage from './components/TagRelationsPage';
import RelatedTagsPanel from './components/RelatedTagsPanel';
import '../ui/styles.css';

window.PluginApi.register.route('/plugin/tag-relations', TagRelationsPage);

window.PluginApi.patch.after('TagPage', (OriginalComponent) => {
  return function PatchedTagPage(props: any) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(OriginalComponent, props),
      React.createElement(RelatedTagsPanel, { tagId: props.match?.params?.id })
    );
  };
});

console.log('[Tag Relations] loaded');