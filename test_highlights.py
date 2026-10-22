from pathlib import Path
import unittest
from page_highlights import locate, highlights


class HighlightTests(unittest.TestCase):
    def test_specific_numbered_clause_does_not_highlight_its_sibling(self):
        words = [{'text':text,'x':i*.1,'y':y,'w':.08,'h':.02}
                 for i,text,y in [(0,'(3)',.4),(1,'Fences;',.4),(0,'(4)',.5),(1,'Fabric',.5),(2,'fences;',.5)]]
        result = locate(words, ['(3) Fences;'])
        self.assertEqual(result['matched'], 1)
        self.assertTrue(all(rect['y']==.4 for rect in result['boxes']))

    def test_normalized_ocr_words_and_wrapped_lines(self):
        words = [{'text':s,'x':.1,'y':i*.03,'w':.2,'h':.02} for i,s in enumerate(['ﬂood,','surface','water'])]
        self.assertEqual(locate(words,['flood, surface\nwater'])['matched'],1)

    def test_unmatched_wording_returns_no_guessed_position(self):
        self.assertEqual(locate([{'text':'Fire','x':0,'y':0,'w':.1,'h':.1}],['Flood'])['boxes'],[])

    def test_highlight_only_query_words_inside_the_selected_clause(self):
        lines=['10. Animals', 'Bodily injury or property damage', '11. Fungi or Bacteria', 'Bodily injury or property damage', 'Fungi means mold or fungus.', '12. Swimming pools', 'Bodily injury or property damage']
        words=[{'text':w,'x':i*.08,'y':row*.1,'w':.07,'h':.02} for row,line in enumerate(lines) for i,w in enumerate(line.split())]
        result=locate(words,['11. Fungi or Bacteria','Bodily injury or property damage','Fungi means mold or fungus.'],['fungi','mold','fungus','bacteria'],True)
        self.assertEqual(result['matched'],3)
        self.assertTrue(result['boxes'])
        self.assertTrue(all(round(r['y'],1) in (.2,.4) for r in result['boxes']))

    def test_repeated_phrase_uses_the_occurrence_after_the_clause_heading(self):
        lines=['10. Other', 'Bodily injury', '11. Selected', 'Bodily injury', '12. Other', 'Bodily injury']
        words=[{'text':w,'x':i*.1,'y':row*.1,'w':.08,'h':.02} for row,line in enumerate(lines) for i,w in enumerate(line.split())]
        result=locate(words,['11. Selected','Bodily injury'],['bodily injury'],True)
        self.assertTrue(result['boxes'])
        self.assertTrue(all(round(r['y'],1)==.3 for r in result['boxes']))

    def test_live_fence_excerpt_positions(self):
        source = Path(__file__).resolve().parent.parent/'CSH FL SPV03 05 23 - Special Provisions.pdf'
        if not source.exists():
            self.skipTest('Private policy fixture is not installed.')
        result = highlights(source,8,['13. Hurricane Loss to:','d. Unattached:','(3) Fences;'])
        self.assertEqual(result['matched'],3)
        self.assertTrue(all(0<=rect['x']<=1 and 0<=rect['y']<=1 for rect in result['boxes']))

    def test_minor_ocr_difference_can_match_between_known_neighboring_lines(self):
        lines=['Fungi means fungus', 'inclucling mold or mildew', 'mycotoxins and spores']
        words=[{'text':w,'x':i*.1,'y':row*.1,'w':.08,'h':.02} for row,line in enumerate(lines) for i,w in enumerate(line.split())]
        result=locate(words,['Fungi means fungus','including mold or mildew','mycotoxins and spores'],['mold'],True)
        self.assertEqual(result['matched'],3)
        self.assertEqual(len(result['boxes']),1)
        self.assertAlmostEqual(result['boxes'][0]['y'],.1)

    def test_ocr_recovery_never_bridges_an_explicit_omission(self):
        lines=['Fungi means fungus', 'including mold or mildew', 'mycotoxins and spores']
        words=[{'text':w,'x':i*.1,'y':row*.1,'w':.08,'h':.02} for row,line in enumerate(lines) for i,w in enumerate(line.split())]
        result=locate(words,['Fungi means fungus','…','wrong mold or mildew','mycotoxins and spores'],['mold'],True)
        self.assertFalse(result['boxes'])


if __name__=='__main__':
    unittest.main()
