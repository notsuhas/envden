use serde_json::Value;

const URGENCY: &[&str] = &[
    "conflict",
    "detached",
    "held-back",
    "missing",
    "local-changes",
    "remote-changes",
    "in-sync",
    "local-only",
];

pub struct IFileFacts<'a> {
    pub local_only: bool,
    pub placement: &'a str,
    pub conflict: bool,
    pub held_back: bool,
    pub changed: bool,
    pub remote: bool,
}

pub fn file_status(facts: &IFileFacts<'_>) -> &'static str {
    if facts.local_only {
        "local-only"
    } else if facts.conflict {
        "conflict"
    } else if facts.placement == "detached" {
        "detached"
    } else if facts.held_back {
        "held-back"
    } else if facts.placement == "missing" {
        "missing"
    } else if facts.changed {
        "local-changes"
    } else if facts.remote {
        "remote-changes"
    } else {
        "in-sync"
    }
}

pub fn pending_count(statuses: &[&str]) -> usize {
    statuses
        .iter()
        .filter(|s| !matches!(**s, "in-sync" | "local-only"))
        .count()
}

pub fn most_urgent(statuses: &[&str]) -> &'static str {
    URGENCY
        .iter()
        .copied()
        .find(|s| statuses.contains(s))
        .unwrap_or("in-sync")
}

pub fn sync_summary(kind: &str, changed: usize, conflicts: usize) -> String {
    format!(
        "{}: {changed} changed, {conflicts} {}.",
        if kind == "pull" { "Pulled" } else { "Pushed" },
        if conflicts == 1 {
            "conflict"
        } else {
            "conflicts"
        }
    )
}

pub fn group_repos(rows: &[Value]) -> Vec<Value> {
    let mut repos: Vec<Value> = Vec::new();
    for row in rows {
        let index = repos.iter().position(|r|r["repoId"] == row["repoId"]).unwrap_or_else(||{repos.push(serde_json::json!({"repoId":row["repoId"],"status":row["file"]["status"],"checkouts":[]}));repos.len()-1});
        let repo = &mut repos[index];
        repo["status"] = Value::from(most_urgent(&[
            repo["status"].as_str().unwrap_or(""),
            row["file"]["status"].as_str().unwrap_or(""),
        ]));
        let checkouts = repo["checkouts"].as_array_mut().unwrap();
        let index = checkouts
            .iter()
            .position(|c| c["root"] == row["root"])
            .unwrap_or_else(|| {
                checkouts.push(
                    serde_json::json!({"root":row["root"],"approval":row["approval"],"files":[]}),
                );
                checkouts.len() - 1
            });
        checkouts[index]["files"]
            .as_array_mut()
            .unwrap()
            .push(row["file"].clone());
    }
    repos.sort_by(|a, b| a["repoId"].as_str().cmp(&b["repoId"].as_str()));
    repos
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn statuses_follow_precedence() {
        let mut facts = IFileFacts {
            local_only: true,
            placement: "detached",
            conflict: true,
            held_back: true,
            changed: true,
            remote: true,
        };
        assert_eq!(file_status(&facts), "local-only");
        facts.local_only = false;
        assert_eq!(file_status(&facts), "conflict");
        facts.conflict = false;
        assert_eq!(file_status(&facts), "detached");
        facts.placement = "missing";
        assert_eq!(file_status(&facts), "held-back");
        facts.held_back = false;
        assert_eq!(file_status(&facts), "missing");
        facts.placement = "linked";
        assert_eq!(file_status(&facts), "local-changes");
        facts.changed = false;
        assert_eq!(file_status(&facts), "remote-changes");
        facts.remote = false;
        assert_eq!(file_status(&facts), "in-sync");
        assert_eq!(
            pending_count(&["in-sync", "local-only", "missing", "conflict"]),
            2
        );
        assert_eq!(most_urgent(&["missing", "conflict"]), "conflict");
        assert_eq!(sync_summary("push", 2, 1), "Pushed: 2 changed, 1 conflict.");
        assert_eq!(
            sync_summary("pull", 0, 0),
            "Pulled: 0 changed, 0 conflicts."
        );
    }
}
