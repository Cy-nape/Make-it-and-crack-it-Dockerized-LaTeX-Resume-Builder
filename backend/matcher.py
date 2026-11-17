# matcher.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer, util

# Router banaya taaki ise app.py mein jod sakein
router = APIRouter(prefix="/matcher", tags=["JD Matcher"])

# Model memory mein load hoga
model = SentenceTransformer('all-MiniLM-L6-v2')

class MatchRequest(BaseModel):
    jd_points: List[str]
    resume_points: List[str]

@router.post("/match-jd")
def calculate_match(data: MatchRequest):
    if not data.jd_points or not data.resume_points:
        return {"error": "JD points ya Resume points empty hain."}

    # Sentences ko dense vectors mein convert karo
    jd_embeddings = model.encode(data.jd_points, convert_to_tensor=True)
    resume_embeddings = model.encode(data.resume_points, convert_to_tensor=True)

    # Cosine similarity matrix calculate karo
    similarity_matrix = util.cos_sim(jd_embeddings, resume_embeddings)

    threshold = 0.55
    total_score = 0.0
    matched_skills = []
    missing_skills = []

    for i, jd_item in enumerate(data.jd_points):
        best_match_idx = similarity_matrix[i].argmax().item()
        best_score = similarity_matrix[i][best_match_idx].item()

        item_detail = {
            "requirement": jd_item,
            "matched_with": data.resume_points[best_match_idx],
            "score": round(best_score * 100, 2)
        }

        if best_score >= threshold:
            matched_skills.append(item_detail)
            total_score += best_score
        else:
            missing_skills.append(item_detail)

    overall_percentage = round((total_score / len(data.jd_points)) * 100, 2)

    return {
        "overall_match_percentage": overall_percentage,
        "matched_requirements": matched_skills,
        "missing_requirements": missing_skills
    }