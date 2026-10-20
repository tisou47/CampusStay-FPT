package vn.fpt.campusstay.cfg.internal;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface TermRepository extends JpaRepository<TermEntity, Long> {

    boolean existsByCode(String code);

    List<TermEntity> findAllByOrderByStayStartDesc();
}
