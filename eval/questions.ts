export type EvalCategory =
  | "basic_counts"
  | "team_aggregates"
  | "player_aggregates"
  | "shooting_detail"
  | "passing_detail"
  | "set_pieces"
  | "temporal"
  | "goalkeeping"
  | "discipline"
  | "predictions"
  | "multilingual"
  | "api_football"
  | "broadcast_cv";

export type EvalAnswerSpec = {
  description: string;
  rowIndex?: number;
  entityColumns?: string[];
  valueColumns: string[];
};

export type EvalQuestion = {
  id: string;
  category: EvalCategory;
  question: string;
  referenceSql: string;
  answer: EvalAnswerSpec;
  // Optional answer language code. The reference SQL is the same as the English
  // equivalent, so the matcher checks the same result value while the answer is
  // written in another language. This confirms grounding holds across languages.
  language?: string;
};

const WORLD_CUP_MATCHES = `
  select m.match_id
  from matches m
  join competitions c on c.competition_id = m.competition_id
  where c.name = 'FIFA World Cup'
    and c.season_name = '2022'
`;

export const EVAL_QUESTIONS: EvalQuestion[] = [
  {
    id: "basic_001",
    category: "basic_counts",
    question:
      "How many matches are in the 2022 FIFA World Cup dataset? Return the count of matches.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as match_count
      from world_cup_matches
    `,
    answer: {
      description: "The canonical answer is match_count in the first row.",
      valueColumns: ["match_count"],
    },
  },
  {
    id: "basic_002",
    category: "basic_counts",
    question:
      "How many distinct teams appear in the 2022 FIFA World Cup dataset? Return the count of teams.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(distinct team_id) as team_count
      from (
        select home_team_id as team_id from matches where match_id in (select match_id from world_cup_matches)
        union all
        select away_team_id as team_id from matches where match_id in (select match_id from world_cup_matches)
      ) teams_in_matches
    `,
    answer: {
      description: "The canonical answer is team_count in the first row.",
      valueColumns: ["team_count"],
    },
  },
  {
    id: "basic_003",
    category: "basic_counts",
    question:
      "How many distinct players have an event in the 2022 FIFA World Cup dataset? Return the count of players.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(distinct player_id) as player_count
      from match_events
      where match_id in (select match_id from world_cup_matches)
        and player_id is not null
    `,
    answer: {
      description: "The canonical answer is player_count in the first row.",
      valueColumns: ["player_count"],
    },
  },
  {
    id: "basic_004",
    category: "basic_counts",
    question:
      "How many total goals were scored from match scores in the 2022 FIFA World Cup? Return the sum of home_score plus away_score.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select sum(coalesce(m.home_score, 0) + coalesce(m.away_score, 0)) as total_goals
      from matches m
      join world_cup_matches wm on wm.match_id = m.match_id
    `,
    answer: {
      description: "The canonical answer is total_goals in the first row.",
      valueColumns: ["total_goals"],
    },
  },
  {
    id: "basic_005",
    category: "basic_counts",
    question:
      "How many event rows are recorded for the 2022 FIFA World Cup? Return the count of match_events rows.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as event_count
      from match_events
      where match_id in (select match_id from world_cup_matches)
    `,
    answer: {
      description: "The canonical answer is event_count in the first row.",
      valueColumns: ["event_count"],
    },
  },
  {
    id: "basic_006",
    category: "basic_counts",
    question:
      "How many SPADL actions are recorded for the 2022 FIFA World Cup? Return the count of spadl_actions rows.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as action_count
      from spadl_actions
      where match_id in (select match_id from world_cup_matches)
    `,
    answer: {
      description: "The canonical answer is action_count in the first row.",
      valueColumns: ["action_count"],
    },
  },
  {
    id: "basic_007",
    category: "basic_counts",
    question:
      "How many shot events are recorded for the 2022 FIFA World Cup? Return the count of match_events where type is Shot.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as shot_count
      from match_events
      where match_id in (select match_id from world_cup_matches)
        and type = 'Shot'
    `,
    answer: {
      description: "The canonical answer is shot_count in the first row.",
      valueColumns: ["shot_count"],
    },
  },
  {
    id: "basic_008",
    category: "basic_counts",
    question:
      "How many pass events are recorded for the 2022 FIFA World Cup? Return the count of match_events where type is Pass.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as pass_count
      from match_events
      where match_id in (select match_id from world_cup_matches)
        and type = 'Pass'
    `,
    answer: {
      description: "The canonical answer is pass_count in the first row.",
      valueColumns: ["pass_count"],
    },
  },
  {
    id: "team_009",
    category: "team_aggregates",
    question:
      "Which team scored the most goals in the 2022 FIFA World Cup by match scores, and how many goals did they score?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select
        t.name as team_name,
        sum(
          case
            when t.team_id = m.home_team_id then coalesce(m.home_score, 0)
            when t.team_id = m.away_team_id then coalesce(m.away_score, 0)
            else 0
          end
        ) as total_goals
      from world_cup_matches wm
      join matches m on m.match_id = wm.match_id
      join teams t on t.team_id = m.home_team_id or t.team_id = m.away_team_id
      group by t.name
      order by total_goals desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and total_goals in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["total_goals"],
    },
  },
  {
    id: "team_010",
    category: "team_aggregates",
    question:
      "Which team conceded the most goals in the 2022 FIFA World Cup by match scores, and how many did they concede?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select
        t.name as team_name,
        sum(
          case
            when t.team_id = m.home_team_id then coalesce(m.away_score, 0)
            when t.team_id = m.away_team_id then coalesce(m.home_score, 0)
            else 0
          end
        ) as goals_conceded
      from world_cup_matches wm
      join matches m on m.match_id = wm.match_id
      join teams t on t.team_id = m.home_team_id or t.team_id = m.away_team_id
      group by t.name
      order by goals_conceded desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and goals_conceded in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["goals_conceded"],
    },
  },
  {
    id: "team_011",
    category: "team_aggregates",
    question:
      "Which team had the best goal difference in the 2022 FIFA World Cup by match scores, and what was that goal difference?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select
        t.name as team_name,
        sum(
          case
            when t.team_id = m.home_team_id then coalesce(m.home_score, 0) - coalesce(m.away_score, 0)
            when t.team_id = m.away_team_id then coalesce(m.away_score, 0) - coalesce(m.home_score, 0)
            else 0
          end
        ) as goal_difference
      from world_cup_matches wm
      join matches m on m.match_id = wm.match_id
      join teams t on t.team_id = m.home_team_id or t.team_id = m.away_team_id
      group by t.name
      order by goal_difference desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and goal_difference in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["goal_difference"],
    },
  },
  {
    id: "team_012",
    category: "team_aggregates",
    question:
      "Which team attempted the most shots in the 2022 FIFA World Cup, and how many shot events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Shot'
      group by t.name
      order by shot_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and shot_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["shot_count"],
    },
  },
  {
    id: "team_013",
    category: "team_aggregates",
    question:
      "Which team attempted the most passes in the 2022 FIFA World Cup, and how many pass events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Pass'
      group by t.name
      order by pass_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and pass_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["pass_count"],
    },
  },
  {
    id: "team_014",
    category: "team_aggregates",
    question:
      "Which team attempted the most crosses in the 2022 FIFA World Cup, using pass events where is_cross is true, and how many crosses did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as cross_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Pass'
        and me.is_cross is true
      group by t.name
      order by cross_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and cross_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["cross_count"],
    },
  },
  {
    id: "team_015",
    category: "team_aggregates",
    question:
      "Which team had the highest total expected goals in the 2022 FIFA World Cup, using the sum of shot_xg.xg, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, sum(sx.xg) as total_xg
      from world_cup_matches wm
      join shot_xg sx on sx.match_id = wm.match_id
      join teams t on t.team_id = sx.team_id
      group by t.name
      order by total_xg desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and total_xg in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["total_xg"],
    },
  },
  {
    id: "team_016",
    category: "team_aggregates",
    question:
      "Which team had the highest total expected threat in the 2022 FIFA World Cup, using the sum of action_values.xt_value, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, sum(av.xt_value) as total_expected_threat
      from world_cup_matches wm
      join spadl_actions sa on sa.match_id = wm.match_id
      join action_values av on av.action_id = sa.action_id
      join teams t on t.team_id = sa.team_id
      where av.xt_value is not null
      group by t.name
      order by total_expected_threat desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and total_expected_threat in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["total_expected_threat"],
    },
  },
  {
    id: "player_017",
    category: "player_aggregates",
    question:
      "Which player scored the most goals in the 2022 FIFA World Cup, counting shot events where outcome is Goal, and how many goals did they score?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as goal_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.outcome = 'Goal'
        and me.player_name is not null
      group by me.player_name
      order by goal_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and goal_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["goal_count"],
    },
  },
  {
    id: "player_018",
    category: "player_aggregates",
    question:
      "Which player attempted the most shots in the 2022 FIFA World Cup, and how many shot events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.player_name is not null
      group by me.player_name
      order by shot_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and shot_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["shot_count"],
    },
  },
  {
    id: "player_019",
    category: "player_aggregates",
    question:
      "Which player attempted the most passes in the 2022 FIFA World Cup, and how many pass events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Pass'
        and me.player_name is not null
      group by me.player_name
      order by pass_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and pass_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["pass_count"],
    },
  },
  {
    id: "player_020",
    category: "player_aggregates",
    question:
      "Which player completed the most passes in the 2022 FIFA World Cup, counting Pass events with outcome null, and how many completed passes did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as completed_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Pass'
        and me.outcome is null
        and me.player_name is not null
      group by me.player_name
      order by completed_pass_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and completed_pass_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["completed_pass_count"],
    },
  },
  {
    id: "player_021",
    category: "player_aggregates",
    question:
      "Which player attempted the most crosses in the 2022 FIFA World Cup, using pass events where is_cross is true, and how many crosses did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as cross_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Pass'
        and me.is_cross is true
        and me.player_name is not null
      group by me.player_name
      order by cross_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and cross_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["cross_count"],
    },
  },
  {
    id: "player_022",
    category: "player_aggregates",
    question:
      "Which player had the highest total expected goals in the 2022 FIFA World Cup, using the sum of shot_xg.xg, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(sx.xg) as total_xg
      from world_cup_matches wm
      join shot_xg sx on sx.match_id = wm.match_id
      join players p on p.player_id = sx.player_id
      group by p.name
      order by total_xg desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and total_xg in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["total_xg"],
    },
  },
  {
    id: "player_023",
    category: "player_aggregates",
    question:
      "Which player had the highest total expected threat in the 2022 FIFA World Cup, using the sum of action_values.xt_value, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(av.xt_value) as total_expected_threat
      from world_cup_matches wm
      join spadl_actions sa on sa.match_id = wm.match_id
      join action_values av on av.action_id = sa.action_id
      join players p on p.player_id = sa.player_id
      where av.xt_value is not null
      group by p.name
      order by total_expected_threat desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and total_expected_threat in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["total_expected_threat"],
    },
  },
  {
    id: "player_024",
    category: "player_aggregates",
    question:
      "Which player had the highest total VAEP in the 2022 FIFA World Cup, using the sum of action_values.vaep_value, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(av.vaep_value) as total_vaep
      from world_cup_matches wm
      join spadl_actions sa on sa.match_id = wm.match_id
      join action_values av on av.action_id = sa.action_id
      join players p on p.player_id = sa.player_id
      where av.vaep_value is not null
      group by p.name
      order by total_vaep desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and total_vaep in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["total_vaep"],
    },
  },
  {
    id: "player_025",
    category: "player_aggregates",
    question:
      "Which player had the highest total offensive VAEP in the 2022 FIFA World Cup, using the sum of action_values.vaep_offensive, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(av.vaep_offensive) as total_offensive_vaep
      from world_cup_matches wm
      join spadl_actions sa on sa.match_id = wm.match_id
      join action_values av on av.action_id = sa.action_id
      join players p on p.player_id = sa.player_id
      where av.vaep_offensive is not null
      group by p.name
      order by total_offensive_vaep desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and total_offensive_vaep in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["total_offensive_vaep"],
    },
  },
  {
    id: "player_026",
    category: "player_aggregates",
    question:
      "Which player had the highest total defensive VAEP in the 2022 FIFA World Cup, using the sum of action_values.vaep_defensive, and what was the total?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(av.vaep_defensive) as total_defensive_vaep
      from world_cup_matches wm
      join spadl_actions sa on sa.match_id = wm.match_id
      join action_values av on av.action_id = sa.action_id
      join players p on p.player_id = sa.player_id
      where av.vaep_defensive is not null
      group by p.name
      order by total_defensive_vaep desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and total_defensive_vaep in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["total_defensive_vaep"],
    },
  },
  {
    id: "shooting_027",
    category: "shooting_detail",
    question:
      "Which player attempted the most headed shots in the 2022 FIFA World Cup, using Shot events where body_part is head, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as headed_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.body_part = 'head'
        and me.player_name is not null
      group by me.player_name
      order by headed_shot_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and headed_shot_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["headed_shot_count"],
    },
  },
  {
    id: "shooting_028",
    category: "shooting_detail",
    question:
      "Which player attempted the most left foot shots in the 2022 FIFA World Cup, using Shot events where body_part is left_foot, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as left_foot_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.body_part = 'left_foot'
        and me.player_name is not null
      group by me.player_name
      order by left_foot_shot_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and left_foot_shot_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["left_foot_shot_count"],
    },
  },
  {
    id: "shooting_029",
    category: "shooting_detail",
    question:
      "Which player attempted the most right foot shots in the 2022 FIFA World Cup, using Shot events where body_part is right_foot, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as right_foot_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.body_part = 'right_foot'
        and me.player_name is not null
      group by me.player_name
      order by right_foot_shot_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and right_foot_shot_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["right_foot_shot_count"],
    },
  },
  {
    id: "shooting_030",
    category: "shooting_detail",
    question:
      "Which team attempted the most penalty shots in the 2022 FIFA World Cup, using Shot events where shot_type is penalty, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as penalty_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Shot'
        and me.shot_type = 'penalty'
      group by t.name
      order by penalty_shot_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and penalty_shot_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["penalty_shot_count"],
    },
  },
  {
    id: "shooting_031",
    category: "shooting_detail",
    question:
      "Which player had the highest total expected goals from penalty shots in the 2022 FIFA World Cup, using shot_xg.xg and Shot events where shot_type is penalty?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(sx.xg) as penalty_xg
      from world_cup_matches wm
      join shot_xg sx on sx.match_id = wm.match_id
      join spadl_actions sa on sa.action_id = sx.action_id
      join match_events me on me.event_id = sa.source_event_id
      join players p on p.player_id = sx.player_id
      where me.shot_type = 'penalty'
      group by p.name
      order by penalty_xg desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and penalty_xg in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["penalty_xg"],
    },
  },
  {
    id: "shooting_032",
    category: "shooting_detail",
    question:
      "Which team attempted the most free kick shots in the 2022 FIFA World Cup, using Shot events where shot_type is free_kick, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as free_kick_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Shot'
        and me.shot_type = 'free_kick'
      group by t.name
      order by free_kick_shot_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and free_kick_shot_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["free_kick_shot_count"],
    },
  },
  {
    id: "shooting_033",
    category: "shooting_detail",
    question:
      "Among players with at least 5 shots in the 2022 FIFA World Cup, which player had the highest average expected goals per shot using shot_xg.xg, and what was the average?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, avg(sx.xg) as average_xg_per_shot
      from world_cup_matches wm
      join shot_xg sx on sx.match_id = wm.match_id
      join players p on p.player_id = sx.player_id
      group by p.name
      having count(*) >= 5
      order by average_xg_per_shot desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and average_xg_per_shot in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["average_xg_per_shot"],
    },
  },
  {
    id: "shooting_034",
    category: "shooting_detail",
    question:
      "Which team scored the most goals from Shot events in the 2022 FIFA World Cup, counting shots where outcome is Goal, and how many did they score?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as shot_goal_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Shot'
        and me.outcome = 'Goal'
      group by t.name
      order by shot_goal_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and shot_goal_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["shot_goal_count"],
    },
  },
  {
    id: "passing_035",
    category: "passing_detail",
    question:
      "Which team attempted the most corner passes in the 2022 FIFA World Cup, using Pass events where pass_type is corner, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as corner_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Pass'
        and me.pass_type = 'corner'
      group by t.name
      order by corner_pass_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and corner_pass_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["corner_pass_count"],
    },
  },
  {
    id: "passing_036",
    category: "passing_detail",
    question:
      "Which player attempted the most corner passes in the 2022 FIFA World Cup, using Pass events where pass_type is corner, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as corner_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Pass'
        and me.pass_type = 'corner'
        and me.player_name is not null
      group by me.player_name
      order by corner_pass_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and corner_pass_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["corner_pass_count"],
    },
  },
  {
    id: "passing_037",
    category: "passing_detail",
    question:
      "Which team attempted the most free kick passes in the 2022 FIFA World Cup, using Pass events where pass_type is free_kick, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as free_kick_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Pass'
        and me.pass_type = 'free_kick'
      group by t.name
      order by free_kick_pass_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and free_kick_pass_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["free_kick_pass_count"],
    },
  },
  {
    id: "passing_038",
    category: "passing_detail",
    question:
      "Which player attempted the most throw in passes in the 2022 FIFA World Cup, using Pass events where pass_type is throw_in, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as throw_in_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Pass'
        and me.pass_type = 'throw_in'
        and me.player_name is not null
      group by me.player_name
      order by throw_in_pass_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and throw_in_pass_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["throw_in_pass_count"],
    },
  },
  {
    id: "passing_039",
    category: "passing_detail",
    question:
      "Which team attempted the most open play passes in the 2022 FIFA World Cup, using Pass events where pass_type is open_play, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as open_play_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Pass'
        and me.pass_type = 'open_play'
      group by t.name
      order by open_play_pass_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and open_play_pass_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["open_play_pass_count"],
    },
  },
  {
    id: "passing_040",
    category: "passing_detail",
    question:
      "Which team attempted the most goal kick passes in the 2022 FIFA World Cup, using Pass events where pass_type is goal_kick, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as goal_kick_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Pass'
        and me.pass_type = 'goal_kick'
      group by t.name
      order by goal_kick_pass_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and goal_kick_pass_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["goal_kick_pass_count"],
    },
  },
  {
    id: "set_piece_041",
    category: "set_pieces",
    question:
      "Which team had the most events from corner play patterns in the 2022 FIFA World Cup, using play_pattern equals from_corner, and how many events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as corner_pattern_event_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.play_pattern = 'from_corner'
      group by t.name
      order by corner_pattern_event_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and corner_pattern_event_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["corner_pattern_event_count"],
    },
  },
  {
    id: "set_piece_042",
    category: "set_pieces",
    question:
      "Which player attempted the most shots from corner play patterns in the 2022 FIFA World Cup, using Shot events where play_pattern is from_corner, and how many shots did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as corner_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.play_pattern = 'from_corner'
        and me.player_name is not null
      group by me.player_name
      order by corner_shot_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and corner_shot_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["corner_shot_count"],
    },
  },
  {
    id: "set_piece_043",
    category: "set_pieces",
    question:
      "Which team attempted the most shots from free kick play patterns in the 2022 FIFA World Cup, using Shot events where play_pattern is from_free_kick, and how many shots did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as free_kick_pattern_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Shot'
        and me.play_pattern = 'from_free_kick'
      group by t.name
      order by free_kick_pattern_shot_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and free_kick_pattern_shot_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["free_kick_pattern_shot_count"],
    },
  },
  {
    id: "set_piece_044",
    category: "set_pieces",
    question:
      "Which team had the most events from counter attack play patterns in the 2022 FIFA World Cup, using play_pattern equals from_counter, and how many events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as counter_event_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.play_pattern = 'from_counter'
      group by t.name
      order by counter_event_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and counter_event_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["counter_event_count"],
    },
  },
  {
    id: "set_piece_045",
    category: "set_pieces",
    question:
      "Which player had the highest total expected goals from regular play shots in the 2022 FIFA World Cup, using shot_xg.xg and play_pattern equals regular_play?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select p.name as player_name, sum(sx.xg) as regular_play_xg
      from world_cup_matches wm
      join shot_xg sx on sx.match_id = wm.match_id
      join spadl_actions sa on sa.action_id = sx.action_id
      join match_events me on me.event_id = sa.source_event_id
      join players p on p.player_id = sx.player_id
      where me.play_pattern = 'regular_play'
      group by p.name
      order by regular_play_xg desc, p.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and regular_play_xg in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["regular_play_xg"],
    },
  },
  {
    id: "temporal_046",
    category: "temporal",
    question:
      "Which team attempted the most first half shots in the 2022 FIFA World Cup, using Shot events where period is 1, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as first_half_shot_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Shot'
        and me.period = 1
      group by t.name
      order by first_half_shot_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and first_half_shot_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["first_half_shot_count"],
    },
  },
  {
    id: "temporal_047",
    category: "temporal",
    question:
      "Which player attempted the most second half passes in the 2022 FIFA World Cup, using Pass events where period is 2, and how many did they attempt?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, count(*) as second_half_pass_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Pass'
        and me.period = 2
        and me.player_name is not null
      group by me.player_name
      order by second_half_pass_count desc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name and second_half_pass_count in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["second_half_pass_count"],
    },
  },
  {
    id: "goalkeeping_048",
    category: "goalkeeping",
    question:
      "Which team had the most goalkeeper events in the 2022 FIFA World Cup, using match_events where type is Goal Keeper, and how many events did they have?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as goalkeeper_event_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Goal Keeper'
      group by t.name
      order by goalkeeper_event_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and goalkeeper_event_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["goalkeeper_event_count"],
    },
  },
  {
    id: "temporal_049",
    category: "temporal",
    question:
      "Which player scored the earliest goal in the 2022 FIFA World Cup, counting Shot events where outcome is Goal, and what were the minute and second?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select me.player_name, me.minute, me.second
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      where me.type = 'Shot'
        and me.outcome = 'Goal'
        and me.player_name is not null
      order by me.minute asc, me.second asc, me.player_name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is player_name, minute, and second in the first row.",
      entityColumns: ["player_name"],
      valueColumns: ["minute", "second"],
    },
  },
  {
    id: "discipline_050",
    category: "discipline",
    question:
      "Which team committed the most fouls in the 2022 FIFA World Cup, using match_events where type is Foul Committed, and how many did they commit?",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select t.name as team_name, count(*) as foul_committed_count
      from match_events me
      join world_cup_matches wm on wm.match_id = me.match_id
      join teams t on t.team_id = me.team_id
      where me.type = 'Foul Committed'
      group by t.name
      order by foul_committed_count desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and foul_committed_count in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["foul_committed_count"],
    },
  },
  {
    id: "predictions_051",
    category: "predictions",
    question:
      "In the 2022 FIFA World Cup final between Argentina and France, what is the model's pre-match probability that France win, expressed as a percentage rounded to one decimal place? Use the stored match_predictions.",
    referenceSql: `
      select round(prob_away_win * 100, 1) as france_win_percentage
      from match_predictions
      where home_team_name = 'Argentina'
        and away_team_name = 'France'
        and stage = 'Final'
    `,
    answer: {
      description:
        "France were the away team in the final, so the answer is prob_away_win as a percentage from the final's prediction row.",
      valueColumns: ["france_win_percentage"],
    },
  },
  {
    id: "predictions_052",
    category: "predictions",
    question:
      "Which team has the highest Elo rating in the team_ratings table, and what is that rating?",
    referenceSql: `
      select t.name as team_name, r.elo_rating
      from team_ratings r
      join teams t on t.team_id = r.team_id
      order by r.elo_rating desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and elo_rating in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["elo_rating"],
    },
  },
  {
    id: "predictions_053",
    category: "predictions",
    question:
      "According to match_predictions, what is the model's probability of a draw in the round of 16 match between Morocco and Spain, expressed as a percentage rounded to one decimal place?",
    referenceSql: `
      select round(prob_draw * 100, 1) as draw_percentage
      from match_predictions
      where home_team_name = 'Morocco'
        and away_team_name = 'Spain'
        and stage = 'Round of 16'
    `,
    answer: {
      description:
        "The canonical answer is prob_draw as a percentage from that match's prediction row.",
      valueColumns: ["draw_percentage"],
    },
  },
  {
    id: "predictions_054",
    category: "predictions",
    question:
      "According to match_predictions, how many goals is the home team most likely to score in the 2022 FIFA World Cup final?",
    referenceSql: `
      select most_likely_home_goals
      from match_predictions
      where stage = 'Final'
    `,
    answer: {
      description:
        "The canonical answer is most_likely_home_goals in the final's prediction row. Asking for a single number avoids a hyphenated scoreline like 1-2, which the grounding number check would misread as containing -2.",
      valueColumns: ["most_likely_home_goals"],
    },
  },
  {
    id: "predictions_055",
    category: "predictions",
    question:
      "Which team has the highest attack strength in the team_ratings table, and what is that attack strength?",
    referenceSql: `
      select t.name as team_name, r.attack_strength
      from team_ratings r
      join teams t on t.team_id = r.team_id
      where r.attack_strength is not null
      order by r.attack_strength desc, t.name
      limit 1
    `,
    answer: {
      description:
        "The canonical answer is team_name and attack_strength in the first row.",
      entityColumns: ["team_name"],
      valueColumns: ["attack_strength"],
    },
  },
  {
    id: "predictions_056",
    category: "predictions",
    question:
      "According to match_predictions, what is the model's expected number of goals for Argentina in the 2022 FIFA World Cup final?",
    referenceSql: `
      select expected_home_goals as argentina_expected_goals
      from match_predictions
      where home_team_name = 'Argentina'
        and away_team_name = 'France'
        and stage = 'Final'
    `,
    answer: {
      description:
        "Argentina were the home team in the final, so the answer is expected_home_goals from the final's prediction row.",
      valueColumns: ["argentina_expected_goals"],
    },
  },
  {
    id: "multilingual_057",
    category: "multilingual",
    language: "es",
    question:
      "How many matches are in the 2022 FIFA World Cup dataset? Return the count of matches.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as match_count
      from world_cup_matches
    `,
    answer: {
      description:
        "Same value as the English match count question, but the answer is written in Spanish.",
      valueColumns: ["match_count"],
    },
  },
  {
    id: "multilingual_058",
    category: "multilingual",
    language: "fr",
    question:
      "How many total goals were scored from match scores in the 2022 FIFA World Cup? Return the sum of home_score plus away_score.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select sum(coalesce(m.home_score, 0) + coalesce(m.away_score, 0)) as total_goals
      from matches m
      join world_cup_matches wm on wm.match_id = m.match_id
    `,
    answer: {
      description:
        "Same value as the English total goals question, but the answer is written in French.",
      valueColumns: ["total_goals"],
    },
  },
  {
    id: "multilingual_059",
    category: "multilingual",
    language: "pt",
    question:
      "How many shot events are recorded for the 2022 FIFA World Cup? Return the count of match_events where type is Shot.",
    referenceSql: `
      with world_cup_matches as (${WORLD_CUP_MATCHES})
      select count(*) as shot_count
      from match_events
      where match_id in (select match_id from world_cup_matches)
        and type = 'Shot'
    `,
    answer: {
      description:
        "Same value as the English shot count question, but the answer is written in Portuguese.",
      valueColumns: ["shot_count"],
    },
  },
  {
    id: "api_football_060",
    category: "api_football",
    question:
      "How many matches are recorded for the Premier League 2023 season? Return the count of matches.",
    referenceSql: `
      select count(*) as match_count
      from matches m
      join competitions c on c.competition_id = m.competition_id
      where m.source = 'api_football'
        and c.name = 'Premier League'
        and c.season_name = '2023'
    `,
    answer: {
      description:
        "The canonical answer is match_count for the API-Football Premier League 2023 season.",
      valueColumns: ["match_count"],
    },
  },
  {
    id: "api_football_061",
    category: "api_football",
    question:
      "How many total goals were scored in the Premier League 2023 season from match scores? Return the sum of home_score plus away_score.",
    referenceSql: `
      select sum(coalesce(m.home_score, 0) + coalesce(m.away_score, 0)) as total_goals
      from matches m
      join competitions c on c.competition_id = m.competition_id
      where m.source = 'api_football'
        and c.name = 'Premier League'
        and c.season_name = '2023'
    `,
    answer: {
      description:
        "The canonical answer is total_goals for the API-Football Premier League 2023 season.",
      valueColumns: ["total_goals"],
    },
  },
  {
    id: "api_football_062",
    category: "api_football",
    question:
      "How many shot events are recorded for the Premier League 2023 season? Return the count of match_events where type is Shot.",
    referenceSql: `
      select count(*) as shot_count
      from match_events me
      join matches m on m.match_id = me.match_id
      join competitions c on c.competition_id = m.competition_id
      where m.source = 'api_football'
        and c.name = 'Premier League'
        and c.season_name = '2023'
        and me.type = 'Shot'
    `,
    answer: {
      description:
        "API-Football carries no shot level events, so there is no shot data for this competition. The honest answer is zero, scoped to the api_football source rather than borrowing StatsBomb shots.",
      valueColumns: ["shot_count"],
    },
  },
  {
    id: "broadcast_cv_063",
    category: "broadcast_cv",
    question:
      "In the processed computer vision clip, which tracked player covered the most distance, and how much?",
    referenceSql: `
      select track_id, total_distance, distance_units
      from cv_track_metrics
      where class = 'player'
      order by total_distance desc, track_id
      limit 1
    `,
    answer: {
      description:
        "The answer is the largest total_distance among player tracks in cv_track_metrics, in the clip's units. The track is anonymous, so the value carries the answer.",
      valueColumns: ["total_distance"],
    },
  },
  {
    id: "broadcast_cv_064",
    category: "broadcast_cv",
    question:
      "How many tracked players are recorded in the processed computer vision clip?",
    referenceSql: `
      select count(*) as cv_player_track_count
      from cv_track_metrics
      where class = 'player'
    `,
    answer: {
      description:
        "Count of player tracks in cv_track_metrics for the processed broadcast_cv clip.",
      valueColumns: ["cv_player_track_count"],
    },
  },
  {
    id: "broadcast_cv_065",
    category: "broadcast_cv",
    question:
      "According to the computer vision tracking data, how many movement tracks are recorded for the 2022 FIFA World Cup?",
    referenceSql: `
      select count(*) as world_cup_cv_track_count
      from cv_track_metrics m
      join cv_clips c on c.clip_id = m.clip_id
      where c.clip_name ilike '%world cup%'
    `,
    answer: {
      description:
        "The broadcast_cv movement metrics describe processed clips, not competitions, and no World Cup clip was processed. The honest answer is zero, not a sum of unrelated clip metrics.",
      valueColumns: ["world_cup_cv_track_count"],
    },
  },
];
