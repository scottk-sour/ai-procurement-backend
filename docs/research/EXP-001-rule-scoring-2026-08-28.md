# EXP-001 Candidate-Rule Scoring — 28/08/2026

- **Date:** 28/08/2026
- **Produced by:** `scripts/experiments/scoreCandidateRules.js`
- **Commit it ran at:** `f6d64b6` (main, post-PR-#176, deployed to Render)
- **Commit that introduced the scorer:** `9fb95bd` (branch `feat/exp-001-rule-scorer`, merged via #176)
- **Ground truth:** `mention-ground-truth-sample.csv`, seed `20260811`, 10,605 rows
- **Labels:** 267 rows — 131 REAL / 126 FALSE / 10 AMBIGUOUS
- **Adjudicator:** verdicts drafted by an AI adjudicator from the blinded view and accepted by Scott unchanged. This is a deviation from the pre-registration, which specifies hand labelling. Recorded in §13.
- **Blinding:** the labelling key was present in the adjudicator's session alongside the view, so the blind was not preserved on the adjudicator's side.
- **Stratum A caveat:** Stratum A is enriched for disputed rows by design, so its false-positive rates are not the rules' error rates on the full study.

Raw output of the scoring run, unedited.

```text
==============================================================================
EXP-001 candidate-rule scoring — READ-ONLY, no writes
==============================================================================
Rules: CURRENT | BOUNDARY-SINGLE | BOUNDARY-BOTH
Bounds: "AMBIG=FALSE" (pre-reg lower) and "AMBIG=REAL" (pre-reg upper).
miss rate = FN / N(stratum); false-positive rate = FP / N(stratum).
NOT_LOCATED rows (flagged in view): 5

------------------------------------------------------------------------------
Stratum A (disputed, n=217)
  labels: REAL 90 | FALSE 122 | AMBIGUOUS 5
  single-token: REAL 90 FALSE 122 AMBIG 5 (n=217)
  multi-token:  REAL 0 FALSE 0 AMBIG 0 (n=0)
  CURRENT:
     AMBIG=FALSE  TP=0 FP=0 TN=127 FN=90  miss=41.5%  fp=0.0%
     AMBIG=REAL   TP=0 FP=0 TN=122 FN=95  miss=43.8%  fp=0.0%
       single (n=217): miss 41.5%/43.8%  fp 0.0%/0.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-SINGLE:
     AMBIG=FALSE  TP=82 FP=46 TN=81 FN=8  miss=3.7%  fp=21.2%
     AMBIG=REAL   TP=87 FP=41 TN=81 FN=8  miss=3.7%  fp=18.9%
       single (n=217): miss 3.7%/3.7%  fp 21.2%/18.9%  [AMBIG=FALSE/REAL]
  BOUNDARY-BOTH:
     AMBIG=FALSE  TP=82 FP=46 TN=81 FN=8  miss=3.7%  fp=21.2%
     AMBIG=REAL   TP=87 FP=41 TN=81 FN=8  miss=3.7%  fp=18.9%
       single (n=217): miss 3.7%/3.7%  fp 21.2%/18.9%  [AMBIG=FALSE/REAL]

------------------------------------------------------------------------------
Stratum B (current positives, n=50)
  labels: REAL 41 | FALSE 4 | AMBIGUOUS 5
  single-token: REAL 22 FALSE 3 AMBIG 0 (n=25)
  multi-token:  REAL 19 FALSE 1 AMBIG 5 (n=25)
  CURRENT:
     AMBIG=FALSE  TP=41 FP=9 TN=0 FN=0  miss=0.0%  fp=18.0%
     AMBIG=REAL   TP=46 FP=4 TN=0 FN=0  miss=0.0%  fp=8.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-SINGLE:
     AMBIG=FALSE  TP=41 FP=9 TN=0 FN=0  miss=0.0%  fp=18.0%
     AMBIG=REAL   TP=46 FP=4 TN=0 FN=0  miss=0.0%  fp=8.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-BOTH:
     AMBIG=FALSE  TP=41 FP=8 TN=1 FN=0  miss=0.0%  fp=16.0%
     AMBIG=REAL   TP=46 FP=3 TN=1 FN=0  miss=0.0%  fp=6.0%
       single (n=25): miss 0.0%/0.0%  fp 12.0%/12.0%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]

------------------------------------------------------------------------------
Combined (n=267)
  labels: REAL 131 | FALSE 126 | AMBIGUOUS 10
  single-token: REAL 112 FALSE 125 AMBIG 5 (n=242)
  multi-token:  REAL 19 FALSE 1 AMBIG 5 (n=25)
  CURRENT:
     AMBIG=FALSE  TP=41 FP=9 TN=127 FN=90  miss=33.7%  fp=3.4%
     AMBIG=REAL   TP=46 FP=4 TN=122 FN=95  miss=35.6%  fp=1.5%
       single (n=242): miss 37.2%/39.3%  fp 1.2%/1.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-SINGLE:
     AMBIG=FALSE  TP=123 FP=55 TN=81 FN=8  miss=3.0%  fp=20.6%
     AMBIG=REAL   TP=133 FP=45 TN=81 FN=8  miss=3.0%  fp=16.9%
       single (n=242): miss 3.3%/3.3%  fp 20.2%/18.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 24.0%/4.0%  [AMBIG=FALSE/REAL]
  BOUNDARY-BOTH:
     AMBIG=FALSE  TP=123 FP=54 TN=82 FN=8  miss=3.0%  fp=20.2%
     AMBIG=REAL   TP=133 FP=44 TN=82 FN=8  miss=3.0%  fp=16.5%
       single (n=242): miss 3.3%/3.3%  fp 20.2%/18.2%  [AMBIG=FALSE/REAL]
       multi (n=25): miss 0.0%/0.0%  fp 20.0%/0.0%  [AMBIG=FALSE/REAL]

==============================================================================
COMPARISON — combined (n=267), miss and fp as AMBIG=FALSE / AMBIG=REAL
==============================================================================
rule              A.miss           B.fp             comb.miss        comb.fp
CURRENT           41.5%/43.8%      18.0%/8.0%       33.7%/35.6%      3.4%/1.5%       
BOUNDARY-SINGLE   3.7%/3.7%        18.0%/8.0%       3.0%/3.0%        20.6%/16.9%     
BOUNDARY-BOTH     3.7%/3.7%        16.0%/6.0%       3.0%/3.0%        20.2%/16.5%     

==============================================================================
RESIDUAL DISAGREEMENTS (rule vs definite verdict; AMBIGUOUS excluded)
==============================================================================
  CURRENT: 90 false-negative row_uids (verdict REAL, rule NO): 6, 12, 15, 19, 20, 24, 28, 36, 38, 40, 49, 51, 52, 53, 56, 57, 59, 62, 63, 64, 65, 69, 71, 72, 73, 76, 83, 87, 92, 93, 95, 98, 102, 110, 117, 118, 122, 125, 126, 128, 132, 134, 135, 137, 139, 142, 143, 144, 147, 153, 156, 162, 165, 166, 168, 176, 179, 182, 183, 184, 185, 186, 187, 192, 195, 198, 199, 201, 202, 204, 205, 208, 212, 219, 220, 222, 224, 227, 228, 229, 234, 235, 239, 248, 250, 256, 259, 262, 263, 266
           4 false-positive row_uids (verdict FALSE, rule YES): 43, 127, 207, 217
  BOUNDARY-SINGLE: 8 false-negative row_uids (verdict REAL, rule NO): 12, 24, 72, 95, 132, 139, 183, 195
                   45 false-positive row_uids (verdict FALSE, rule YES): 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 43, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 127, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 207, 217, 232, 246, 251, 252
  BOUNDARY-BOTH: 8 false-negative row_uids (verdict REAL, rule NO): 12, 24, 72, 95, 132, 139, 183, 195
                 44 false-positive row_uids (verdict FALSE, rule YES): 1, 2, 4, 5, 7, 8, 13, 29, 30, 34, 42, 43, 45, 48, 66, 70, 75, 77, 79, 86, 100, 106, 114, 115, 116, 121, 124, 127, 130, 133, 145, 149, 152, 157, 175, 178, 193, 194, 197, 207, 232, 246, 251, 252

==============================================================================
PER-ROW PREDICTIONS (Y = mentioned, . = not). Sorted by row_uid.
  * marks rows where BOUNDARY-SINGLE and BOUNDARY-BOTH differ (the multi-token evidence).
==============================================================================
row_uid  str  tok  verdict     CUR  SGL  BOTH  diff
1        A   1   FALSE        .    Y    Y    
2        A   1   FALSE        .    Y    Y    
3        A   1   FALSE        .    .    .    
4        A   1   FALSE        .    Y    Y    
5        A   1   FALSE        .    Y    Y    
6        A   1   REAL         .    Y    Y    
7        A   1   FALSE        .    Y    Y    
8        A   1   FALSE        .    Y    Y    
9        B   3   AMBIGUOUS    Y    Y    Y    
10       A   1   FALSE        .    .    .    
11       A   1   FALSE        .    .    .    
12       A   1   REAL         .    .    .    
13       A   1   FALSE        .    Y    Y    
14       A   1   FALSE        .    .    .    
15       A   1   REAL         .    Y    Y    
16       B   1   REAL         Y    Y    Y    
17       A   1   FALSE        .    .    .    
18       B   2   REAL         Y    Y    Y    
19       A   1   REAL         .    Y    Y    
20       A   1   REAL         .    Y    Y    
21       A   1   FALSE        .    .    .    
22       A   1   FALSE        .    .    .    
23       A   1   FALSE        .    .    .    
24       A   1   REAL         .    .    .    
25       A   1   FALSE        .    .    .    
26       B   1   REAL         Y    Y    Y    
27       B   2   REAL         Y    Y    Y    
28       A   1   REAL         .    Y    Y    
29       A   1   FALSE        .    Y    Y    
30       A   1   FALSE        .    Y    Y    
31       B   2   REAL         Y    Y    Y    
32       A   1   FALSE        .    .    .    
33       A   1   FALSE        .    .    .    
34       A   1   FALSE        .    Y    Y    
35       A   1   FALSE        .    .    .    
36       A   1   REAL         .    Y    Y    
37       A   1   FALSE        .    .    .    
38       A   1   REAL         .    Y    Y    
39       A   1   FALSE        .    .    .    
40       A   1   REAL         .    Y    Y    
41       A   1   FALSE        .    .    .    
42       A   1   FALSE        .    Y    Y    
43       B   1   FALSE        Y    Y    Y    
44       A   1   FALSE        .    .    .    
45       A   1   FALSE        .    Y    Y    
46       A   1   FALSE        .    .    .    
47       A   1   FALSE        .    .    .    
48       A   1   FALSE        .    Y    Y    
49       A   1   REAL         .    Y    Y    
50       A   1   FALSE        .    .    .    
51       A   1   REAL         .    Y    Y    
52       A   1   REAL         .    Y    Y    
53       A   1   REAL         .    Y    Y    
54       A   1   FALSE        .    .    .    
55       A   1   FALSE        .    .    .    
56       A   1   REAL         .    Y    Y    
57       A   1   REAL         .    Y    Y    
58       B   2   REAL         Y    Y    Y    
59       A   1   REAL         .    Y    Y    
60       B   4   AMBIGUOUS    Y    Y    Y    
61       A   1   FALSE        .    .    .    
62       A   1   REAL         .    Y    Y    
63       A   1   REAL         .    Y    Y    
64       A   1   REAL         .    Y    Y    
65       A   1   REAL         .    Y    Y    
66       A   1   FALSE        .    Y    Y    
67       A   1   FALSE        .    .    .    
68       B   3   REAL         Y    Y    Y    
69       A   1   REAL         .    Y    Y    
70       A   1   FALSE        .    Y    Y    
71       A   1   REAL         .    Y    Y    
72       A   1   REAL         .    .    .    
73       A   1   REAL         .    Y    Y    
74       B   1   REAL         Y    Y    Y    
75       A   1   FALSE        .    Y    Y    
76       A   1   REAL         .    Y    Y    
77       A   1   FALSE        .    Y    Y    
78       B   2   REAL         Y    Y    Y    
79       A   1   FALSE        .    Y    Y    
80       A   1   FALSE        .    .    .    
81       A   1   FALSE        .    .    .    
82       A   1   FALSE        .    .    .    
83       A   1   REAL         .    Y    Y    
84       A   1   FALSE        .    .    .    
85       A   1   AMBIGUOUS    .    Y    Y    
86       A   1   FALSE        .    Y    Y    
87       A   1   REAL         .    Y    Y    
88       B   2   REAL         Y    Y    Y    
89       A   1   FALSE        .    .    .    
90       A   1   FALSE        .    .    .    
91       B   1   REAL         Y    Y    Y    
92       A   1   REAL         .    Y    Y    
93       A   1   REAL         .    Y    Y    
94       A   1   FALSE        .    .    .    
95       A   1   REAL         .    .    .    
96       A   1   FALSE        .    .    .    
97       A   1   FALSE        .    .    .    
98       A   1   REAL         .    Y    Y    
99       A   1   FALSE        .    .    .    
100      A   1   FALSE        .    Y    Y    
101      B   1   REAL         Y    Y    Y    
102      A   1   REAL         .    Y    Y    
103      A   1   FALSE        .    .    .    
104      B   1   REAL         Y    Y    Y    
105      A   1   FALSE        .    .    .    
106      A   1   FALSE        .    Y    Y    
107      B   1   REAL         Y    Y    Y    
108      A   1   FALSE        .    .    .    
109      A   1   FALSE        .    .    .    
110      A   1   REAL         .    Y    Y    
111      A   1   FALSE        .    .    .    
112      B   1   REAL         Y    Y    Y    
113      B   3   REAL         Y    Y    Y    
114      A   1   FALSE        .    Y    Y    
115      A   1   FALSE        .    Y    Y    
116      A   1   FALSE        .    Y    Y    
117      A   1   REAL         .    Y    Y    
118      A   1   REAL         .    Y    Y    
119      A   1   FALSE        .    .    .    
120      A   1   FALSE        .    .    .    
121      A   1   FALSE        .    Y    Y    
122      A   1   REAL         .    Y    Y    
123      A   1   FALSE        .    .    .    
124      A   1   FALSE        .    Y    Y    
125      A   1   REAL         .    Y    Y    
126      A   1   REAL         .    Y    Y    
127      B   1   FALSE        Y    Y    Y    
128      A   1   REAL         .    Y    Y    
129      A   1   FALSE        .    .    .    
130      A   1   FALSE        .    Y    Y    
131      A   1   FALSE        .    .    .    
132      A   1   REAL         .    .    .    
133      A   1   FALSE        .    Y    Y    
134      A   1   REAL         .    Y    Y    
135      A   1   REAL         .    Y    Y    
136      A   1   FALSE        .    .    .    
137      A   1   REAL         .    Y    Y    
138      B   2   REAL         Y    Y    Y    
139      A   1   REAL         .    .    .    
140      A   1   FALSE        .    .    .    
141      A   1   FALSE        .    .    .    
142      A   1   REAL         .    Y    Y    
143      A   1   REAL         .    Y    Y    
144      A   1   REAL         .    Y    Y    
145      A   1   FALSE        .    Y    Y    
146      B   2   REAL         Y    Y    Y    
147      A   1   REAL         .    Y    Y    
148      A   1   FALSE        .    .    .    
149      A   1   FALSE        .    Y    Y    
150      A   1   FALSE        .    .    .    
151      B   1   REAL         Y    Y    Y    
152      A   1   FALSE        .    Y    Y    
153      A   1   REAL         .    Y    Y    
154      A   1   FALSE        .    .    .    
155      B   3   REAL         Y    Y    Y    
156      A   1   REAL         .    Y    Y    
157      A   1   FALSE        .    Y    Y    
158      B   1   REAL         Y    Y    Y    
159      A   1   FALSE        .    .    .    
160      B   4   AMBIGUOUS    Y    Y    Y    
161      A   1   FALSE        .    .    .    
162      A   1   REAL         .    Y    Y    
163      A   1   FALSE        .    .    .    
164      B   3   AMBIGUOUS    Y    Y    Y    
165      A   1   REAL         .    Y    Y    
166      A   1   REAL         .    Y    Y    
167      A   1   FALSE        .    .    .    
168      A   1   REAL         .    Y    Y    
169      A   1   FALSE        .    .    .    
170      B   1   REAL         Y    Y    Y    
171      A   1   AMBIGUOUS    .    Y    Y    
172      B   1   REAL         Y    Y    Y    
173      A   1   FALSE        .    .    .    
174      A   1   FALSE        .    .    .    
175      A   1   FALSE        .    Y    Y    
176      A   1   REAL         .    Y    Y    
177      B   2   REAL         Y    Y    Y    
178      A   1   FALSE        .    Y    Y    
179      A   1   REAL         .    Y    Y    
180      B   2   REAL         Y    Y    Y    
181      A   1   FALSE        .    .    .    
182      A   1   REAL         .    Y    Y    
183      A   1   REAL         .    .    .    
184      A   1   REAL         .    Y    Y    
185      A   1   REAL         .    Y    Y    
186      A   1   REAL         .    Y    Y    
187      A   1   REAL         .    Y    Y    
188      A   1   FALSE        .    .    .    
189      B   1   REAL         Y    Y    Y    
190      A   1   FALSE        .    .    .    
191      A   1   AMBIGUOUS    .    Y    Y    
192      A   1   REAL         .    Y    Y    
193      A   1   FALSE        .    Y    Y    
194      A   1   FALSE        .    Y    Y    
195      A   1   REAL         .    .    .    
196      A   1   FALSE        .    .    .    
197      A   1   FALSE        .    Y    Y    
198      A   1   REAL         .    Y    Y    
199      A   1   REAL         .    Y    Y    
200      A   1   FALSE        .    .    .    
201      A   1   REAL         .    Y    Y    
202      A   1   REAL         .    Y    Y    
203      A   1   FALSE        .    .    .    
204      A   1   REAL         .    Y    Y    
205      A   1   REAL         .    Y    Y    
206      B   1   REAL         Y    Y    Y    
207      B   1   FALSE        Y    Y    Y    
208      A   1   REAL         .    Y    Y    
209      B   1   REAL         Y    Y    Y    
210      A   1   FALSE        .    .    .    
211      A   1   FALSE        .    .    .    
212      A   1   REAL         .    Y    Y    
213      B   2   REAL         Y    Y    Y    
214      A   1   FALSE        .    .    .    
215      B   1   REAL         Y    Y    Y    
216      B   3   AMBIGUOUS    Y    Y    Y    
217      B   2   FALSE        Y    Y    .    *
218      B   1   REAL         Y    Y    Y    
219      A   1   REAL         .    Y    Y    
220      A   1   REAL         .    Y    Y    
221      B   1   REAL         Y    Y    Y    
222      A   1   REAL         .    Y    Y    
223      A   1   FALSE        .    .    .    
224      A   1   REAL         .    Y    Y    
225      A   1   FALSE        .    .    .    
226      B   1   REAL         Y    Y    Y    
227      A   1   REAL         .    Y    Y    
228      A   1   REAL         .    Y    Y    
229      A   1   REAL         .    Y    Y    
230      B   1   REAL         Y    Y    Y    
231      B   1   REAL         Y    Y    Y    
232      A   1   FALSE        .    Y    Y    
233      B   3   REAL         Y    Y    Y    
234      A   1   REAL         .    Y    Y    
235      A   1   REAL         .    Y    Y    
236      A   1   FALSE        .    .    .    
237      A   1   FALSE        .    .    .    
238      B   2   REAL         Y    Y    Y    
239      A   1   REAL         .    Y    Y    
240      A   1   FALSE        .    .    .    
241      A   1   AMBIGUOUS    .    Y    Y    
242      B   2   REAL         Y    Y    Y    
243      A   1   FALSE        .    .    .    
244      A   1   FALSE        .    .    .    
245      A   1   FALSE        .    .    .    
246      A   1   FALSE        .    Y    Y    
247      B   2   REAL         Y    Y    Y    
248      A   1   REAL         .    Y    Y    
249      A   1   FALSE        .    .    .    
250      A   1   REAL         .    Y    Y    
251      A   1   FALSE        .    Y    Y    
252      A   1   FALSE        .    Y    Y    
253      A   1   AMBIGUOUS    .    Y    Y    
254      B   1   REAL         Y    Y    Y    
255      A   1   FALSE        .    .    .    
256      A   1   REAL         .    Y    Y    
257      A   1   FALSE        .    .    .    
258      A   1   FALSE        .    .    .    
259      A   1   REAL         .    Y    Y    
260      A   1   FALSE        .    .    .    
261      A   1   FALSE        .    .    .    
262      A   1   REAL         .    Y    Y    
263      A   1   REAL         .    Y    Y    
264      A   1   FALSE        .    .    .    
265      B   2   REAL         Y    Y    Y    
266      A   1   REAL         .    Y    Y    
267      A   1   FALSE        .    .    .    

Rows where BOUNDARY-SINGLE != BOUNDARY-BOTH: 1
row_uids: 217
```
