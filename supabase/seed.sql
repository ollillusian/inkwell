-- supabase/seed.sql
-- ---------------------------------------------------------------------------
-- Demo seed for local development. Persona: "Theo", 24 — a winger ~4 days post
-- ACL reconstruction, journalling the first ~6 weeks of rehab.
--
-- This version has a SHAPED arc (not 34 flat notes):
--   Wk1 setup/shock → Wk2 denial & the world moving on → Wk3 routine + the first
--   comparison wounds → Wk4 a MIDPOINT FALSE DAWN that collapses into a hidden
--   setback → Wk5 ROCK BOTTOM (identity void, replacement extended) → Wk6 a
--   flicker (Bemi) that fades, ending unresolved. Subplots build and pay off
--   (the loanee, Bemi, physio Dana, the gaffer, mum, Liv). Entries are full,
--   multi-paragraph reflections with strong opening lines (list/week/month views
--   clamp to 2–3 lines; the day-detail page renders the full body, whitespace
--   preserved). The honest "stuck/spiraling" truth is kept but DRAMATISED.
--
-- Idempotent: safe to run repeatedly, and auto-runs on `supabase db reset`. The
-- entries block is skipped if the user already has entries, so to REPLACE prior
-- seeded data, delete the user's entries/stories first (see the apply step).
--
-- Login:  test@inkwell.local  /  inkwell123
-- ---------------------------------------------------------------------------

do $seed$
declare
  v_uid uuid;
begin
  ---------------------------------------------------------------------------
  -- 1. Find or create the auth user.
  ---------------------------------------------------------------------------
  select id into v_uid from auth.users where email = 'test@inkwell.local';

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'test@inkwell.local', crypt('inkwell123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    );
    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'test@inkwell.local', 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  ---------------------------------------------------------------------------
  -- 2. Profile.
  ---------------------------------------------------------------------------
  update public.profiles set
    display_name        = 'Theo',
    onboarding_complete = true,
    topics              = array['processing','work','relationships','self_compassion','hopes'],
    timezone            = 'UTC',
    tone_tags           = array['raw','dark','sharp'],
    writing_voice       = $b$Clipped, a bit sarcastic, footballer's brain. I hate self-pity and I'm full of it. Short sentences when it's bad, longer when I can't stop. Gallows humour. I'd rather take the mick than admit it hurts.$b$
  where id = v_uid;

  ---------------------------------------------------------------------------
  -- 3. Entries — only if this user has none yet.
  ---------------------------------------------------------------------------
  if not exists (select 1 from public.entries where user_id = v_uid) then
    insert into public.entries
      (user_id, prompt_text, prompt_slot, body, topics_snapshot, written_at, is_draft)
    values

    -- ===== Week 1 (Apr 20–26): setup / shock =====
    (v_uid, $p$What's the first true thing about this morning?$p$, 'morning',
$b$Four days since they put me back together and I still wake up forgetting, for about half a second, before the knee reminds me.

The scan said full ACL, lateral meniscus too. The surgeon was kind about it, which somehow made it worse, because people are only that gentle when the news is big. "Nine months," he said, "if it goes well." If. He said the word like it was nothing and moved straight on to the brace.

Nine months. I've not gone nine days without a ball since I was six. The last time I went a full week without training I was eleven and in a cast, and even then I did keepy-uppies sitting down.

I'm twenty-four. I'm sleeping on the sofa because I can't do the stairs yet, and I let my mum come and help, which tells you everything. Everyone keeps saying it'll fly by. It's day four and it has not flown by. It's sat on my chest the whole time.$b$,
     array['processing','work'], '2026-04-20T07:30:00Z', false),

    (v_uid, $p$What did today look like from where you sat?$p$, 'day',
$b$Went in to "stay around the group." Watched the session from the analysts' box on crutches, looking down at the lads doing rondos in the rain like it was the best thing in the world. Which it is. I just forgot that, until I couldn't do it.

They clocked me up there and waved. I waved back. Felt like a mascot. One of those cardboard cutouts they put in the stands.

The gaffer came up after, all warmth, hand on the shoulder, "big season ahead for you when you're back, son." Everyone keeps talking about when I'm back. Nobody seems to be in here with me now, in the part where I'm not. The back is a country I'm not sure I've still got a visa for.$b$,
     array['work','processing'], '2026-04-21T12:40:00Z', false),

    (v_uid, $p$What are you carrying into the night?$p$, 'bedtime',
$b$Physio starts in the morning and I've been dreading it since they wheeled me out of recovery.

Everyone keeps saying the same five words — you'll come back stronger — like it's a fact instead of a hope they're handing me because the truth is too heavy to bring into the room. On what evidence, though. Nobody's got an answer that isn't a poster on a treatment-room wall.

I didn't tear a hamstring. I tore the thing that made me me. The first yard. The bit they scouted me for at fourteen, the change of pace you can't coach. There's no stronger version of a winger who can't push off his left foot.

I watched the Leeds goal tonight. The one from March, top corner, in front of the away end. Watched it four times. Then I put the phone face down, because the lad in that clip felt like someone I used to know, not someone I'm going to be.$b$,
     array['processing','memories'], '2026-04-22T22:30:00Z', false),

    (v_uid, $p$How did today go?$p$, 'day',
$b$Back at the club for lunch with the lads. Five people did the head-tilt and asked how I am. I said "yeah, good, getting there" until it stopped being words.

There's no update. It's still torn. It's not a situation that develops by Thursday.$b$,
     array['processing'], '2026-04-24T12:30:00Z', false),

    (v_uid, $p$What keeps replaying in your head?$p$, 'bedtime',
$b$I keep watching the tackle. Not on a screen, I don't need a screen, it just plays in my head every time it goes quiet.

It wasn't even a bad one. No malice, no horror lunge. I planted to turn inside the full-back, the way I've done ten thousand times, and the knee just left. Went one way while the rest of me went the other. I heard it before I felt it. People say that and you don't believe them until it's your own.

A nothing moment. A patch of grass and my own body, and eleven years of getting up at six and saying no to things other people said yes to, all of it undone in less time than it takes to read this.

I keep replaying it like the ending might change if I watch enough. Like there's a version where I take the easy pass. There isn't. There's just the one where I'm here, on the sofa, twenty-four, writing about a turn I'll spend nine months earning back the right to make.$b$,
     array['memories','work'], '2026-04-26T22:30:00Z', false),

    -- ===== Week 2 (Apr 27–May 3): denial → anger; the world moves on =====
    (v_uid, $p$What did today ask of your body?$p$, 'morning',
$b$First proper physio. I'd built it up as the start of the comeback. The training montage. Day one of the rest of it.

The goal for the week, Dana said, is to get my quad to "fire." To make a muscle switch on. I lay on a bench and tried to tighten my thigh and watched it do absolutely nothing, this dead thing attached to me, and she said "that's normal, the brain's just protecting it," and I nodded like that helped.

I used to beat international full-backs for pace. Today I declared war on my own thigh and lost, twice, and Dana wrote something encouraging on a clipboard. I know it's the process. It just doesn't feel like the start of anything. It feels like being handed back the most basic version of myself and told to be grateful.$b$,
     array['work','processing'], '2026-04-27T07:30:00Z', false),

    (v_uid, $p$What's pulling at you today?$p$, 'day',
$b$The group chat is the worst thing I own.

It never stops. Clips, voice notes, someone's dog, who's man of the match, a photo of the canteen spread. I muted it Tuesday. Unmuted an hour later because muting it felt like being dead. Muted it again last night.

I want to be in it and I can't stand being in it, both at once, all day. They're not doing anything wrong. They're just carrying on, because that's what the season does, with or without you. Mostly without.

Bemi texts me separately, just me, every couple of days. "You alright pal." I leave it on read for hours then send something that isn't true. Don't know why I can lie easier than I can let him in. He's the only one still knocking and I keep not answering the door.$b$,
     array['work','relationships'], '2026-04-29T12:30:00Z', false),

    (v_uid, $p$Was there a moment today that stung?$p$, 'day',
$b$We won 2-1. The kid got the winner.

The loanee. The one they brought in to "cover," playing in my position, and he puts away a near-post finish in the 88th that I watched on my phone from the sofa with a bag of frozen peas on my knee.

I watched the celebration. The slide, the pile-on, the away end losing it. And I felt two things at the exact same time and they would not sit together: happy for him, genuinely, he's a good kid and it was a good goal — and wanting to put my phone through the wall hard enough to leave a mark. Both. True. At once.

I typed "get in lad 🔥🔥" into the chat. Took me three goes to get the tone right, which is its own kind of sick, workshopping my own delight at being replaced. Felt like chewing glass and smiling while I did it.

Then everyone piled onto his goal and the chat moved on, and I sat there in the blue light feeling the exact shape of the hole where I used to be.$b$,
     array['work','relationships'], '2026-04-30T12:30:00Z', false),

    (v_uid, $p$How did the night treat you?$p$, 'bedtime',
$b$3am again. The knee throbs and the brain takes it as an invitation to do the maths.

Nine months from April is January. January is half a season gone. By the time I'm fit, am I even in the squad, is there a me-shaped gap left or has it closed over like water. I never get to the end of the sum. I just lie there doing it until it gets light.$b$,
     array['processing','free'], '2026-05-01T22:30:00Z', false),

    (v_uid, $p$Name a few small good things.$p$, 'evening',
$b$The app wants three good things. Fine.

One: the knee technically still bends, on a hinge, like a knee should. Two: the crutches are a nice matte black, very understated. Three: I've got a physio who's kinder to me than I'm being to myself, which isn't hard at the minute.

There. Three good things. I don't feel a single one of them. I feel like a man filling in a worksheet about a life that used to belong to him. I know gratitude's meant to help. Tonight it feels like being told to smile by someone who's never had the thing they love taken out of them on a Tuesday afternoon by a patch of grass.$b$,
     array['gratitude'], '2026-05-03T21:00:00Z', false),

    -- ===== Week 3 (May 4–10): routine + the first comparison wounds =====
    (v_uid, $p$What felt possible today, even briefly?$p$, 'morning',
$b$Got on the bike today. Stationary, no resistance, basically pedalling air in a corner of the gym while the first team did finishing forty feet away.

And for about ninety seconds — this is embarrassing — I forgot. Both legs going round, doing a thing, rhythmic and mine, and some animal part of my brain went oh, we're back, this is it. Ninety seconds of that.

Then I went to get off it, put weight through the leg the wrong way, and the fear shot up through me like cold water. Not pain. Fear. The pure animal certainty that it's going to go again.

That's the new injury, I reckon. The knee will heal on its schedule. But there's a flinch in me now that wasn't there in March, and nobody's putting a date on that one.$b$,
     array['work','hopes'], '2026-05-04T07:30:00Z', false),

    (v_uid, $p$What did looking back stir up?$p$, 'day',
$b$Found my goals compilation on my phone tonight. Some edit a fan made last season, 23 of them, two years of work, set to music I'd never choose. Watched the whole thing twice.

Used to be, watching my own highlights felt like proof. Evidence. Look, that's me, that's what I do, you can't take it back. A bank I could draw on when the doubt came.

Tonight it was a museum. Here is what this exhibit was once capable of. Roped off, lit nicely, past tense. There's me against City, round the keeper. The chip at Villa. The bloke in those clips moves like he's never once thought about his knee, because he never once had to. I'd give a lot to be that stupid again. That unthinking. That free.

I keep the comp. Don't know why. Maybe to remember it was real, maybe to punish myself with it. Probably both. Lately it's always both.$b$,
     array['memories','work'], '2026-05-06T12:30:00Z', false),

    (v_uid, $p$Who's been trying to reach you?$p$, 'bedtime',
$b$Mum called again. I gave her the same three sentences I give everyone — yeah, good, progressing, physio's happy, ahead of schedule even — and she said "that's my boy" and I heard her relax down the phone and I hated it, because it was a lie and she bought it because she wants to.

The thing is the sentences aren't even wrong. The knee is progressing. The knee is, annoyingly, fine, healing right on the chart they gave me.

It's the rest of me that isn't on any chart. There's no scan for the bit that's actually broken, no protocol, no "ahead of schedule." I can't tell her the operation worked and I'm still not okay, because those two things aren't supposed to be true at once, and she'd only worry, and I've taken enough off her this month.$b$,
     array['relationships','processing'], '2026-05-07T22:30:00Z', false),

    (v_uid, $p$Where could you give yourself some credit?$p$, 'morning',
$b$Brace is off for the walking bits now, so I've spent the day walking. Round the flat. To the end of the road and back.

I'm meant to log it as a win. Dana's whole thing is "celebrate the small ones." And if a teammate told me he'd managed to walk to the corner shop I'd be made up for him, I'd mean it, I'd tell him that's the foundation, well done.

Aimed at myself it just sounds like a grown man clapping because he can do the thing every single person in that shop does without thinking. Toddlers can do it. My nan can do it.

I can't find the version of kind that doesn't sound like an excuse when I point it inward. For everyone else it's compassion. For me it's letting myself off. I don't know when that knife turned to face me but it's been a long time. Longer than the knee.$b$,
     array['self_compassion'], '2026-05-09T07:30:00Z', false),

    (v_uid, $p$What's the truth you didn't say out loud today?$p$, 'bedtime',
$b$We lost 3-0 tonight. And here's the thing I can't say to anyone: a part of me felt better.

Not glad, exactly. Lighter. Like the team being worse without me means I'm still worth something. Like the scoreline was a text from my old life saying we miss you.

And then, about a minute later, the disgust arrived right on cue, because what kind of person needs his own team to lose to feel like he exists. These are my mates. That's my club. I've kissed that badge. And some small starving thing in me lit up at three goals going in the wrong end because it could pretend that meant they need me.

Who thinks that. I lay there genuinely frightened of the maths my own head does when no one's watching. The knee I can rehab. There's no protocol for whatever that was.$b$,
     array['work','processing'], '2026-05-10T22:30:00Z', false),

    -- ===== Week 4 (May 11–17): FALSE DAWN → collapse =====
    (v_uid, $p$What's one win, however small?$p$, 'morning',
$b$Dana said the words this morning and I've carried them around all day like a sweet held in my cheek: "You're ahead of where most lads are at six weeks."

Ahead. Most. The first sentence in a month that pointed forward instead of back.

She bumped the programme — single-leg balance, light loading, a bit of resistance on the bike that actually pushed back. I did all of it twice because once didn't feel like enough to hold the feeling.

I texted Bemi "think I've turned a corner mate." I told Liv over dinner, actually talked at dinner for once instead of pushing food round the plate, said the surgeon's nine months might be conservative, that I could be back for pre-season if I keep this up. She smiled like she hadn't seen me in weeks, which is fair, she hasn't, not really. I've been in the flat but not in it.

First good day since the grass. I know you're not meant to bank on one session. But I've run on empty so long that one drop of fuel feels like a full tank. Don't take this one off me. Just let me have the day.$b$,
     array['work','hopes'], '2026-05-11T07:30:00Z', false),

    (v_uid, $p$How does progress actually feel?$p$, 'bedtime',
$b$Quad's "firing" properly now. Switching on when I ask it to.

Great. My leg can do what a toddler's leg does and we're meant to throw a parade. And I'll say it quietly, because I don't trust it: it does feel like something. Two good days back to back. I nudged the resistance up a notch on the bike without telling Dana, just to see, and it held.

Still set my alarm for 9am out of pure habit. Old training time. Lay there in the dark with the kit I can't wear in a drawer I keep opening for no reason. The body hasn't been told the season's off. It still gets up for work.

Maybe that's not pathetic. Maybe that's the bit of me that drags the rest of me back. Going to sleep on a good thought for once. Noting the date.$b$,
     array['processing','work'], '2026-05-12T22:30:00Z', false),

    (v_uid, $p$What are you not telling anyone?$p$, 'day',
$b$The knee swelled up overnight and I haven't told a soul.

I pushed it Monday, that extra set on the bike, the balance work twice, riding the good feeling. Yesterday it was tight. This morning it's a balloon, hot and stiff and wrong. I know what it is. You overload a healing graft and it complains. It's not a re-tear. Probably. Almost certainly. I've read enough at 3am to know it's probably just angry.

But if I put it in the physio group, Dana pulls me back a stage, the programme resets, and "ahead of where most lads are" becomes "let's be sensible," and the date moves. Again. Further out. So I iced it and said nothing.

I'm sat here at midnight with a bag of peas and the slow realisation that I've just lied — by leaving it out, which is still lying — to the one person in this whole thing who is fully on my side. To protect a date I'm starting to think isn't even real.

That's who I am now, apparently. A bloke who'll hide an injury from his own physio to keep a fantasy alive. I beat full-backs for a living. Now I'm out-running the only person trying to help me.$b$,
     array['processing','self_compassion'], '2026-05-14T12:30:00Z', false),

    (v_uid, $p$What feels uncertain right now?$p$, 'bedtime',
$b$The "nine months" has started to feel made up.

Like a number they say to keep you pedalling the air. Every time I get near a milestone they move the next one further out, gently, kindly, and the finish line walks away at exactly my pace. Maybe there's no date. Maybe there's just this. The date's a carrot and I'm the donkey.$b$,
     array['processing','free'], '2026-05-15T22:30:00Z', false),

    (v_uid, $p$What did you see that you wish you hadn't?$p$, 'day',
$b$The lads went out after the win. I saw it on the stories — the booth, sparklers on a bottle, Bemi doing his stupid dance, the kid right in the middle of it now, one of the boys.

I'd have been there. I'd have been buying the first round, I'm always the one buying the first round. Instead I watched it on a six-inch screen and then I was a name in the "get well soon lad" comments under somebody else's good night.

Out of sight. Five weeks and I can already feel the shape of me closing over, the way a squad closes over an absence, smooth, no seam left.

Liv asked if I wanted to do something tonight, just us. I said I was tired. I wasn't tired. I just can't be a person for someone right now. I'm using everything I've got being one for myself and it isn't enough.$b$,
     array['work','relationships'], '2026-05-17T12:30:00Z', false),

    -- ===== Week 5 (May 18–24): rock bottom =====
    (v_uid, $p$Who are you, outside the thing you do?$p$, 'morning',
$b$Dana asked me a question this morning that's still sat in my chest. Not about the knee. She asked, just chatting, "what are you, outside the football?"

And I had nothing.

I went to answer and there was just air. I'm twenty-four and I could not finish the sentence. I'm a good mate, I suppose. A son. A boyfriend, when I let myself be. But those all felt like things I am around the edges of the real thing, and the real thing is "winger," and a winger is exactly, precisely the one thing I currently am not.

So what's left when you take it out. I've spent eleven years making myself into one thing, sharpening it, protecting it, saying no to every other version of a life so this one could be as good as possible. Turns out if you do that well enough, the day it's taken, there's nobody underneath. Just a bloke with a knee, in a gym, on a bike that goes nowhere.

I didn't say any of that. I said "good question," laughed, changed the subject. Course I did.$b$,
     array['self_compassion','processing'], '2026-05-18T07:30:00Z', false),

    (v_uid, $p$What moved today, and what didn't?$p$, 'day',
$b$They've extended the kid's loan. Until the end of next season.

I found out from the club website. Not the gaffer, not my agent, not a heads-up text — the official site, in among the ticket news, a nice photo of him holding a shirt and grinning. I read it three times to be sure it said what it said.

Nobody's done anything wrong. That's the part that finishes me. No betrayal, no villain. The club has to plan. The kid earned it. The season can't wait for my knee. Everyone's doing the sensible, professional thing, and the sum of all those sensible things is that the space I used to take up has been formally, contractually filled.

Everything moves. The club, the season, the league, the table, the lads, the kid, all of it, a current that never stops — and I'm on a stationary bike in the corner pedalling as hard as I can and going precisely nowhere. That's not a metaphor I reached for. That's literally what I was doing while I read it.$b$,
     array['work','hopes'], '2026-05-20T12:30:00Z', false),

    (v_uid, $p$What runs through your head at 3am?$p$, 'bedtime',
$b$Did the maths again at 3am and tonight I let it run all the way to the end, just to see.

Best case: I come back in January to a team that's learned to win without me, for a manager who'll have new favourites by then, into a league where a 25-year-old with a rebuilt knee is a question mark scouts price in. That's the best case. That's if it "goes well." If.

I used to only ever do best case. Saturday, the next match, the next chance. Now I don't even let myself do worst case — not because I'm being positive, but because I've seen where it goes and I can't follow it down there at 3am on my own. So I lie in the middle. Not hoping, not despairing. Doing sums with no good answer, waiting for it to get light.$b$,
     array['work','processing'], '2026-05-21T22:30:00Z', false),

    (v_uid, $p$Where are you, and what does it stir?$p$, 'travel',
$b$Drove past the training ground today on the way to the clinic. Didn't plan to. It's just the route, the way my hands know it, and I slowed down without deciding to.

Floodlights off. Half-empty car park. The pitches empty and perfect and green behind the fence.

Eleven years that place was the centre of the map. The middle of everything. I knew which gate, which peg, whose parking spot was whose, the exact smell of the corridor by the kit room. I built my whole life around being let through that barrier every morning.

Today it was a building I drove past on the way to get my knee bent by a stranger in a polo shirt. That's all. A nice building behind a fence I used to be allowed into.

I didn't stop. Just that involuntary lift off the accelerator, like the car was paying its respects. Then I drove on and let Dana measure how far my leg will bend now, which is the only measurement of me anyone takes anymore.$b$,
     array['processing','memories'], '2026-05-23T12:30:00Z', false),

    (v_uid, $p$What are you hoping for?$p$, 'bedtime',
$b$Liv asked me tonight, carefully, the way you'd reach for something that bites, whether I'm okay. Really okay.

And instead of letting her in I gave her the knee update. Range of motion, swelling's down, the numbers. Hid behind the one thing that's allowed to be wrong. She nodded and went quiet and I watched her decide not to push it, again, and I let her, again, and something between us got a little thinner that I don't know how to thicken back.

The app asked what I'm hoping for. Used to be easy. Saturday. Always Saturday, the next match, the next ball. Honest answer now: I hope I wake up one day and want something. Anything. That's the whole hope. Not the return, nothing that big. Just the wanting back. I didn't know that was a thing you could lose before you lose the thing itself.$b$,
     array['hopes','relationships','processing'], '2026-05-24T22:30:00Z', false),

    -- ===== Week 6 (May 25–Jun 1): a flicker that fades; unresolved =====
    (v_uid, $p$How does this week begin?$p$, 'morning',
$b$Six weeks today. Everyone warned me the first month would be the worst. It wasn't.

The first month you're in shock, and shock is busy. The op, the cards, the visitors, the novelty, people bringing round food and bad films. There's a job to do.

This is the bit nobody warns you about. The long flat middle. The visits have stopped. The cards came down off the windowsill last week. The knee is, infuriatingly, fine, healing exactly to plan, and I'm not, and there's no drama left to hide that behind, just the days.

I used to think grief was a tunnel. Dark, but with an end you walk toward, the light getting bigger. This isn't a tunnel. There's no end I'm walking at. It's a room. Same furniture, door shut, and I've stopped expecting to be let out and started learning where the walls are.$b$,
     array['processing'], '2026-05-25T07:30:00Z', false),

    (v_uid, $p$Name one small good thing.$p$, 'day',
$b$Tried the gratitude thing again because Dana keeps gently suggesting it and she's earned the benefit of the doubt.

Walked to the shop and back without the brace. Swelling's down again. And a kid — couldn't have been more than nine, in a shirt with my number on the back, my actual number — stopped dead on the pavement and went "are you the injured one off the team?" and I said yeah, that's me, and he said "you'll be back, you're class" with this total, uncomplicated certainty, and ran off.

And for about an hour I held that. Genuinely. A kid in my shirt thinks I'll be back. I carried it home like something hot.

Then it cooled, the way it always does, and slipped through my fingers like water, and by tonight I couldn't feel it anymore, only remember I'd had it. That's the pattern now. Good things visit. They don't move in.$b$,
     array['gratitude'], '2026-05-27T12:30:00Z', false),

    (v_uid, $p$Looking back, what does it all say?$p$, 'day',
$b$Read back through this whole notebook tonight, start to finish, six weeks in one sitting.

It's the same entry. Forty different days and it's the same entry, dressed up: the knee's healing, I'm not, who am I without it, the team moves on, repeat. I keep finding new ways to say the one thing. New metaphors for the same hole. A museum, a room, a current, a carrot. Very poetic. Very stuck.

I started this because someone said writing it down might help, might "move it." It hasn't moved it. All it's done is keep an accurate record of it not moving. A ledger of the same debt, every page.

I don't know what I expected. That naming it would loosen it, I suppose. Instead I've just got very good at describing exactly where I am, in more and more detail, without getting any closer to the door.$b$,
     array['free','processing'], '2026-05-29T12:30:00Z', false),

    (v_uid, $p$Was there a moment of connection today?$p$, 'bedtime',
$b$Bemi turned up tonight. Didn't text first, just knocked, stood there with a carrier bag of beers and a USB of films, and when I opened the door he looked at the crutches and said "you look like a Victorian ghost, get the kettle on."

And here's the thing: he didn't mention football. Not once. Two and a half hours and not one word about the knee, the lads, the kid, the return, the date. Just a daft film and him taking the absolute mick out of how I get off the sofa now, doing impressions of it, until I was laughing so hard the knee actually hurt and I didn't care.

First time I've laughed since the grass. The real kind, from the gut.

And then he left. The door shut. The flat went quiet in that way it does, and the laugh drained straight out of me, and what it left behind was somehow worse — because for two hours I'd forgotten the size of the hole, and now I could see it again, and the laugh had only been a torch showing me how big it is.

One good night. I know what some people would do with that. Call it a turning point, a corner turned. I'm not doing that. One good night doesn't mean I've turned anything. I know me.$b$,
     array['relationships'], '2026-05-30T22:30:00Z', false),

    (v_uid, $p$What do you want to carry into June?$p$, 'morning',
$b$New month. June. Pulled up the rehab plan first thing — the long version, milestones stretching out, that far-off date pencilled in around January.

Stared at it a while. Graft maturation phase. Return-to-running phase. Non-contact, contact, "return to play." Phases. A whole map of a journey to get back to being the bloke I already was, for free, six weeks ago, before a patch of grass.

Closed the app.

Maybe this is just how it is for now. Maybe you don't get the old you back like picking up a parcel. Maybe you carry the gap around and keep pedalling the air, and that's it, that's the whole thing — no part two where it all pays off and means something. Maybe the meaning's a poster on a treatment-room wall.

The lads have training in an hour. I know the exact warm-up they'll be doing. My body knows it. I could drive down, watch from the box, be around the group, be seen to be coping.

I'm not going. Not today. I'm going to sit here with a coffee and not be okay for a bit, on my own, where it's allowed.$b$,
     array['hopes','work'], '2026-06-01T07:30:00Z', false);
  end if;

  ---------------------------------------------------------------------------
  -- 4. Day stories (woven-story cache) for the pivotal days.
  ---------------------------------------------------------------------------
  insert into public.day_stories (user_id, story_date, body, entry_ids)
  select
    v_uid, d.story_date, d.body,
    coalesce((
      select array_agg(e.id) from public.entries e
      where e.user_id = v_uid and e.written_at::date = d.story_date and e.is_draft = false
    ), '{}'::uuid[])
  from (values
    ('2026-04-20'::date,
$b$Four days after the reconstruction, Theo still wakes forgetting for half a second before the knee corrects them. The scan had been blunt, a full ACL and the lateral meniscus, and the surgeon's kindness only made the size of it clearer; nine months, he said, if it goes well, and let the word if hang there before moving on to the brace.

Theo does the arithmetic of a life measured in football: not nine days without a ball since the age of six, and now nine months stretching ahead. Twenty four years old, sleeping on the sofa because the stairs are beyond them, letting their mum help and noticing that they let her. Everyone promises it will fly by. On day four it has not flown by. It has settled on the chest and stayed.$b$),
    ('2026-04-30'::date,
$b$The team won two to one, and the loanee, the kid brought in to cover Theo's position, scored the winner in the 88th minute. Theo watched it on a phone from the sofa, frozen peas on the knee, and felt two things that refused to sit together: genuine gladness for a good kid and a good goal, and the urge to put the phone through the wall hard enough to leave a mark.

It took three attempts to land the tone of a text, fire emojis and all, and Theo named the act exactly: workshopping their own delight at being replaced, chewing glass and smiling through it. Then the chat piled onto the goal and moved on, and Theo sat in the blue light feeling the precise shape of the hole where they used to be.$b$),
    ('2026-05-11'::date,
$b$For the first time in a month, a sentence pointed forward. Ahead of where most lads are at six weeks, Dana said, and Theo carried the words around all day like a sweet held in the cheek. The programme was bumped, single-leg balance and a bike that finally pushed back, and Theo did every drill twice, as if once would not be enough to hold the feeling.

It spilled outward the way good news does: a text to Bemi about turning a corner, an actual conversation with Liv over dinner, talk of the nine months being conservative and pre-season not impossible. The plea underneath was honest and a little frightening. After running on empty so long, one drop of fuel felt like a full tank. Just let me have the one day.$b$),
    ('2026-05-14'::date,
$b$The knee swelled overnight, hot and stiff and wrong, and Theo told no one. The good feeling had been pushed too hard, an extra set, the balance work twice, and the graft was complaining. Probably only complaining.

But reporting it to Dana would reset the programme, turn ahead of where most lads are into let's be sensible, and move the date further out again, so Theo iced it and stayed quiet. By midnight it had become a bag of peas and a clear, ugly recognition: a lie by omission, told to the one person fully on their side, to protect a date Theo was no longer sure was real. A winger who used to beat full-backs, now out-running the only person trying to help.$b$),
    ('2026-05-20'::date,
$b$The club extended the loanee's stay until the end of next season, and Theo learned it from the official website, tucked among the ticket news beside a photo of the kid holding a shirt. They read it three times.

What undid Theo was that no one had done anything wrong: no villain, no betrayal, just a club planning sensibly, a kid who earned it, a season that cannot wait for a knee. The sum of all those reasonable acts is a space formally and contractually filled. Everything moves, Theo wrote, the club and the season and the league and the lads, a current that never stops, while they sit on a stationary bike in the corner pedalling hard and going nowhere. Not a metaphor reached for; the literal thing they were doing as they read it.$b$),
    ('2026-05-30'::date,
$b$Bemi turned up unannounced with a carrier bag of beers and a daft film and, at the sight of the crutches, the line that Theo looked like a Victorian ghost. For two and a half hours he did not mention football once, not the knee or the lads or the date, just took the mick out of how Theo gets off the sofa now until the laughing actually hurt the knee and Theo did not care. The first real laugh since the grass.

Then he left, the door shut, and the flat went quiet in its particular way. The laugh drained out and left something worse behind, because for two hours the hole had been out of sight and now Theo could see the size of it again. The laugh had been a torch, not a cure. One good night, Theo insisted, does not mean anything has turned. I know me.$b$)
  ) as d(story_date, body)
  on conflict (user_id, story_date) do nothing;

  ---------------------------------------------------------------------------
  -- 5. Period stories — weeks (Monday-start date key) and months (YYYY-MM).
  ---------------------------------------------------------------------------
  insert into public.period_stories (user_id, period_type, period_key, body, entry_ids)
  select
    v_uid, p.ptype, p.pkey, p.body,
    coalesce((
      select array_agg(e.id) from public.entries e
      where e.user_id = v_uid and e.is_draft = false
        and case when p.ptype = 'week'
                 then date_trunc('week', e.written_at)::date::text = p.pkey
                 else to_char(e.written_at, 'YYYY-MM') = p.pkey end
    ), '{}'::uuid[])
  from (values
    ('week', '2026-04-20',
$b$The first week home was the week of the half-second: the gap each morning before the knee reminded Theo what had happened. The scan's verdict, a full ACL and the meniscus, and a surgeon kind enough to make the size of it land, set the terms: nine months, if it goes well.

Theo measured it against a life that has not gone nine days without a ball since the age of six and found no scale that made it bearable. They went to the training ground to stay near the group and watched the rondos in the rain from the analysts' box, waving back at the lads like a mascot while the manager promised a big season on the far side. Everyone spoke about the return; no one seemed to be in the now with them, the part where they are not.

By the week's end the tackle had become a loop with no off switch, a nothing turn on a patch of grass that undid eleven years, replayed as if the ending might change. The week closed the way it opened, on the sofa, the Leeds goal watched four times and then turned face down, because the player in the clip felt like someone Theo used to know.$b$),
    ('week', '2026-04-27',
$b$Rehab proper began and arrived as a run of humiliations dressed as milestones. The week's goal was to make a quad fire, to switch a muscle on, and Theo lay on a bench losing a war against their own thigh while Dana wrote something encouraging on a clipboard. A man who beat international full-backs for pace, handed back the most basic version of himself and asked to be grateful for it.

The world, meanwhile, carried on without a seam. The group chat never stopped, muted and unmuted and muted again, because muting it felt like being dead and reading it felt like being buried. The team won and the loanee scored the winner; Theo sent the right emojis and called it chewing glass. Bemi kept knocking, just checking, and Theo kept leaving it on read, lying easier than letting him in.

At three in the morning the arithmetic started, nine months counted forward into a season half gone, into the fear that the me-shaped gap would close over like water. Asked for three good things, Theo filled in the worksheet and felt none of them.$b$),
    ('week', '2026-05-04',
$b$Routine set in, and with it the first real comparison wounds. Ninety seconds on a resistance-free bike were enough for the animal part of the brain to whisper we're back, until Theo stood up wrong and the fear shot through, cold and certain. The knee will heal on schedule, but the flinch that replaced the old freedom has no date on it.

They watched two seasons of their own goals and found a museum where a bank used to be, the player in the clips moving like someone who had never once had to think about a knee. They gave their mother the same three rehearsed sentences and heard her relax down the phone, hating that the lie worked because she wanted it to, unable to explain that the operation succeeded and they are still not okay.

Walking returned, and with it the impossible task of celebrating it; the kindness Theo would extend to any teammate curdles into an excuse the moment it turns inward. The week ended on the ugliest honesty yet: the team lost three nil and a starving part of Theo felt lighter, because being missed felt like mattering, and then the disgust arrived right on cue.$b$),
    ('week', '2026-05-11',
$b$This was the week Theo let themselves believe, and the week it cost them. Ahead of where most lads are at six weeks, Dana said, and the sentence pointed forward for the first time in a month. Theo did every drill twice to hold the feeling, texted Bemi about turning a corner, talked at dinner with Liv about pre-season, banked a full tank of hope on a single drop of fuel. Two good days back to back, a notch added to the bike in secret, and it held. The body still set the old 9am alarm, and for once that felt less like grief than like the part of them that might drag the rest back.

Then the knee swelled overnight, hot and wrong, and Theo told no one, because reporting it to Dana would reset the programme and move the date; so they iced it and lied by omission to the one person fully on their side, to protect a date they had begun to suspect was invented.

By the weekend the nine months felt like a carrot walking away at exactly their pace. The lads were out celebrating with the kid in the middle of them now, and Theo was a name in the get-well-soon comments under someone else's good night, telling Liv they were tired when the truth was they could not be a person for anyone.$b$),
    ('week', '2026-05-18',
$b$The week the questions grew larger than the knee, and none of the answers held. Dana asked what Theo is outside football and the sentence would not finish; eleven years sharpened into a single thing, and the day that thing is taken there is no one underneath, only a bloke with a knee on a bike that goes nowhere.

The club extended the loanee's loan until the end of next season and Theo found out from the website, the space they used to occupy now formally and contractually filled by people doing nothing but the sensible thing. The three in the morning maths ran all the way to its end for once: back in January to a team that has learned to win without them, for a manager with new favourites, in a league that prices in a rebuilt knee. Then they stopped letting themselves do the worst case, not out of positivity but because they could not follow it down there alone.

Driving to the clinic, Theo's hands took the old route past the training ground, floodlights off, and the centre of the map for eleven years became a building behind a fence they used to be allowed into. By the weekend they were hiding behind the knee with Liv, giving range-of-motion numbers instead of letting her in, and the only hope they could name had shrunk to its smallest form: to wake up and want something again.$b$),
    ('week', '2026-05-25',
$b$Six weeks in, the long flat middle nobody warns you about, after the shock and the cards and the visitors have gone. The knee is infuriatingly fine, healing to plan, and Theo is not, with no drama left to hide it behind. Grief stopped being a tunnel with an end to walk toward and became a room with the door shut, and Theo started learning where the walls are instead of expecting to be let out.

There were flickers. A nine-year-old in Theo's shirt number stopping on the pavement to say you'll be back, you're class, held like something hot for an hour and then cooled and slipped through their fingers. Bemi turning up unannounced, no mention of football, the first real laugh since the grass, and then the door closing and the quiet showing Theo the exact size of the hole the laugh had briefly hidden. Good things visit now; they do not move in.

Rereading six weeks of the notebook in one sitting, Theo found the same entry forty times, new metaphors for one unmoving thing, an accurate ledger of a debt that will not clear. The month ended on June's first morning, the far-off January date stared at and the app closed, the lads at training in an hour and Theo choosing not to drive down and be seen to cope. Not today, they wrote. Going to sit with a coffee and not be okay for a bit, on their own, where it is allowed.$b$),
    ('month', '2026-04',
$b$April was the month the floor gave way. It began with a turn Theo had made ten thousand times, a plant to beat the full-back, and a knee that went one way while the rest of them went the other; a sound heard before it was felt, a nothing moment on a patch of grass that undid eleven years. The scan named it, a full ACL and the meniscus, and the surgeon set the sentence over everything: nine months, if it goes well.

The first week home was shock and half-seconds of forgetting, the sofa because the stairs were beyond them, the training ground watched from a box with a mascot's wave while the manager talked about the season on the far side. Then rehab arrived as humiliation dressed as progress, a war lost against their own thigh just to make a muscle switch on. The world refused to wait: the group chat never stopped, the loanee scored the winner, the team won without them, and Theo workshopped a celebratory text and called it chewing glass.

Sleep gave way to three in the morning arithmetic about a season half gone and a gap closing like water. Asked for gratitude, Theo filled in the worksheet and felt like a man documenting a life that used to be his. The month ended where it started, replaying a turn on a patch of grass as if, watched enough times, the ending might change.$b$),
    ('month', '2026-05',
$b$May was supposed to be the climb and it refused to be, though not before it offered Theo one clear look up. Routine settled in, the bike and the brace coming off and the strange task of celebrating walking, shadowed always by comparison: two seasons of their own goals watched like a museum, the rehearsed sentences fed to a mother who relaxed down the phone, a three nil defeat that a starving part of them welcomed because being missed felt like mattering.

Then the one ascent. Ahead of where most lads are at six weeks, and Theo believed it all the way: two good days, a secret notch on the bike, a corner declared turned to Bemi and Liv. It was punished almost at once. The knee swelled, and rather than report it and lose the date, Theo hid it from Dana, lying by omission to the one person on their side to protect a number they no longer trusted.

What followed was the floor of the year. The loanee's loan extended, learned from a website, the space contractually filled by people doing nothing wrong. The question Theo could not answer, what they are outside football, and the empty place where the answer should live. The old route driven past darkened floodlights. Liv kept at arm's length behind range-of-motion numbers. The maths run to its bleak end, then refused entirely.

The month closed on flickers that would not catch: a kid in their shirt number, a night Bemi filled with a film and not one word of football and the first laugh since the grass, each one only measuring the size of the hole as it faded. Rereading the notebook, Theo found the same entry forty times. June's first light, the January date stared at and the app closed, the lads at training and Theo choosing not to go down. Not the return, not a comeback. Just, one day, the wanting back.$b$)
  ) as p(ptype, pkey, body)
  on conflict (user_id, period_type, period_key) do nothing;

  raise notice 'Inkwell seed complete for % — % entries, % day stories, % period stories',
    v_uid,
    (select count(*) from public.entries where user_id = v_uid),
    (select count(*) from public.day_stories where user_id = v_uid),
    (select count(*) from public.period_stories where user_id = v_uid);
end
$seed$;
