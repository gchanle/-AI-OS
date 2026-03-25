import hashlib
import math
import re
from typing import List

import numpy as np


class LocalHashEmbeddings:
    def __init__(self, dimension: int = 1024):
        self.dimension = dimension

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"[\w\u4e00-\u9fff]+", (text or '').lower())

    def _embed_text(self, text: str) -> List[float]:
        vector = np.zeros(self.dimension, dtype=np.float32)
        tokens = self._tokenize(text)
        if not tokens:
            return vector.tolist()

        for token in tokens:
            digest = hashlib.md5(token.encode('utf-8')).hexdigest()
            index = int(digest, 16) % self.dimension
            vector[index] += 1.0

        norm = math.sqrt(float((vector ** 2).sum()))
        if norm > 0:
            vector /= norm
        return vector.tolist()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_text(text) for text in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed_text(text)
